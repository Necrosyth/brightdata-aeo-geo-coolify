import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseWebsiteContent } from "@/lib/server/website-scraper";
import { upsertWebsiteData } from "@/lib/server/website-db";

const InputSchema = z.object({
  urls: z.array(z.string().url()).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { urls } = InputSchema.parse(body);

    const results = [];

    for (const url of urls) {
      try {
        console.log(`Scraping ${url}...`);
        const sections = await parseWebsiteContent(url);

        // Store in database
        for (const section of sections) {
          const stored = await upsertWebsiteData(
            section.url,
            section.sectionName,
            section.title,
            section.content,
            section.metadata,
          );
          results.push(stored);
        }
      } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        results.push({
          url,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Scraped ${urls.length} URL(s)`,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
