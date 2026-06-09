import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { scrapePage } from "@/lib/server/unlocker";
import { callLLM } from "@/lib/server/openrouter-sro";
import type { SiteContext } from "@/lib/server/sro-types";

const requestSchema = z.object({
  url: z.string().url(),
  selectedModel: z.string().optional(),
});

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = requestSchema.parse(body);
    const targetUrl = parsed.url;

    const domain = extractDomain(targetUrl);
    const homepageUrl = `https://${domain}`;

    const page = await scrapePage(homepageUrl);

    if (page.error || !page.fullText) {
      const ctx: SiteContext = {
        domain,
        homepageUrl,
        primaryTopics: [],
        industry: "Unknown",
        targetAudience: "Unknown",
        contentThemes: [],
        siteDescription: "",
        error: page.error || "Could not scrape homepage",
      };
      return NextResponse.json(ctx);
    }

    const snippet = page.fullText.slice(0, 4000);
    const prompt = `Analyze this homepage content and extract structured site context. Respond ONLY with valid JSON matching this schema:
{
  "primaryTopics": ["<topic1>", "<topic2>"],
  "industry": "<industry>",
  "targetAudience": "<audience>",
  "contentThemes": ["<theme1>", "<theme2>"],
  "siteDescription": "<1-2 sentence description>"
}

Homepage URL: ${homepageUrl}
Headings: ${page.headings.slice(0, 20).join(", ")}
Content snippet:
${snippet}`;

    let rawText = "";
    try {
      rawText = await callLLM(
        "You are a web analyst extracting structured site context from homepage content.",
        prompt,
        parsed.selectedModel,
        { temperature: 0.1, maxTokens: 1000 },
      );
    } catch {
      const ctx: SiteContext = {
        domain,
        homepageUrl,
        primaryTopics: page.headings.slice(0, 10),
        industry: "Unknown",
        targetAudience: "Unknown",
        contentThemes: page.headings.slice(0, 5),
        siteDescription: page.contentSnippet.slice(0, 300),
      };
      return NextResponse.json(ctx);
    }

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      const ctx: SiteContext = {
        domain,
        homepageUrl,
        primaryTopics: Array.isArray(parsed.primaryTopics)
          ? parsed.primaryTopics.filter((t: unknown) => typeof t === "string")
          : [],
        industry:
          typeof parsed.industry === "string" ? parsed.industry : "Unknown",
        targetAudience:
          typeof parsed.targetAudience === "string"
            ? parsed.targetAudience
            : "Unknown",
        contentThemes: Array.isArray(parsed.contentThemes)
          ? parsed.contentThemes.filter((t: unknown) => typeof t === "string")
          : [],
        siteDescription:
          typeof parsed.siteDescription === "string"
            ? parsed.siteDescription
            : "",
      };
      return NextResponse.json(ctx);
    } catch {
      const ctx: SiteContext = {
        domain,
        homepageUrl,
        primaryTopics: page.headings.slice(0, 10),
        industry: "Unknown",
        targetAudience: "Unknown",
        contentThemes: page.headings.slice(0, 5),
        siteDescription: page.contentSnippet.slice(0, 300),
      };
      return NextResponse.json(ctx);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
