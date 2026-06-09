import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callLLM } from "@/lib/server/openrouter-sro";

export const runtime = "edge";

const bodySchema = z.object({
  prompt: z.string().min(5),
  selectedModel: z.string().optional(),
  maxTokens: z.number().int().min(128).max(8192).optional(),
  temperature: z.number().min(0).max(1.5).optional(),
  skipCache: z.boolean().optional(),
});

const cache = new Map<string, { expiresAt: number; text: string }>();

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.parse(await req.json());
    const cacheKey = JSON.stringify({
      prompt: parsed.prompt,
      maxTokens: parsed.maxTokens,
      temperature: parsed.temperature,
      selectedModel: parsed.selectedModel,
    });

    if (!parsed.skipCache) {
      const hit = cache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return NextResponse.json({ text: hit.text, cached: true });
      }
    } else {
      cache.delete(cacheKey);
    }

    const text = await callLLM(
      "You are a helpful AI assistant.",
      parsed.prompt,
      parsed.selectedModel,
      {
        temperature: parsed.temperature ?? 0.2,
        maxTokens: parsed.maxTokens ?? 900,
      },
    );

    cache.set(cacheKey, {
      text,
      expiresAt: Date.now() + 1000 * 60 * 30,
    });

    return NextResponse.json({ text, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
