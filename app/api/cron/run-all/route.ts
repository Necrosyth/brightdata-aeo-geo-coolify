import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { kvGet, kvSet } from "@/lib/server/kv-store";
import { runAiScraper } from "@/lib/server/brightdata-scraper";
import { isCloudStorageConfigured } from "@/lib/server/cloud-config";
import {
  getBrandTerms,
  getCompetitorTerms,
  findMentions,
  detectSentiment,
  calcVisibilityScore,
  detectDrift,
} from "@/lib/server/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProviderEnum = z.enum([
  "chatgpt",
  "perplexity",
  "copilot",
  "gemini",
  "google_ai",
  "grok",
]);

/**
 * POST /api/cron/run-all
 *
 * Runs a full batch scrape for the given (or default) workspace.
 * Designed to be called by:
 *   - The in-container scheduler worker (auto-pilot mode)
 *   - An external cron system (Coolify, cron, etc.)
 *
 * Auth: Requires CRON_SECRET env var as Bearer token or ?secret= param.
 *       If CRON_SECRET is not set, the endpoint is unprotected (dev mode).
 *
 * Query params:
 *   workspace  - workspace ID (default: "default")
 *   secret     - CRON_SECRET if not using Authorization header
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  // ── Auth ──────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    const querySecret = req.nextUrl.searchParams.get("secret");
    if (authHeader !== cronSecret && querySecret !== cronSecret) {
      console.warn("[cron] Unauthorized attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Cloud storage check ──────────────────────────────────────
  if (!isCloudStorageConfigured()) {
    console.error("[cron] Cloud storage not configured");
    return NextResponse.json(
      { error: "Cloud storage (DATABASE_URL) is not configured." },
      { status: 501 },
    );
  }

  // ── Read stored state ────────────────────────────────────────
  const wsId = req.nextUrl.searchParams.get("workspace") || "default";
  const storageKey =
    wsId === "default"
      ? "sovereign-aeo-tracker-v1"
      : `sovereign-aeo-tracker-${wsId}`;

  console.log(`[cron] Loading state for workspace "${wsId}" (${storageKey})`);

  const stateRes = await kvGet<Record<string, unknown>>(storageKey);
  if (!stateRes.ok || !stateRes.value) {
    console.warn(`[cron] No stored state for workspace "${wsId}"`);
    return NextResponse.json(
      { error: `No stored state found for workspace "${wsId}".` },
      { status: 404 },
    );
  }
  const state = stateRes.value as Record<string, unknown>;

  // ── Extract config ───────────────────────────────────────────
  const brand = (state.brand ?? {}) as {
    brandName?: string;
    brandAliases?: string;
    websites?: string[];
  };
  const competitors = (state.competitors ?? []) as {
    name: string;
    aliases: string[];
  }[];
  const customPrompts = (state.customPrompts ?? []) as
    | { text: string }[]
    | string[];
  const mainPrompt = (state.prompt as string) ?? "";
  const activeProviders = (state.activeProviders ?? []) as string[];

  // Build prompt list (same logic as the dashboard's runScheduledBatch)
  const prompts: string[] =
    customPrompts.length > 0
      ? customPrompts.map((p: unknown) =>
          typeof p === "string" ? p : (p as { text: string }).text,
        )
      : [mainPrompt];

  const validPrompts = prompts.filter((p): p is string => !!p?.trim());
  if (validPrompts.length === 0) {
    console.warn("[cron] No prompts configured — nothing to run");
    return NextResponse.json(
      { error: "No prompts configured. Add prompts in the dashboard first." },
      { status: 400 },
    );
  }

  const providers: string[] =
    activeProviders.length > 0
      ? activeProviders
      : ["chatgpt", "perplexity", "copilot", "gemini", "google_ai", "grok"];

  // Brand / competitor terms for scoring
  const brandTerms = getBrandTerms(brand);
  const competitorTerms = getCompetitorTerms(competitors);
  const websiteDomains = (brand.websites ?? [])
    .map((w: string) =>
      w
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .toLowerCase(),
    )
    .filter(Boolean);

  // ── Run scrapes ──────────────────────────────────────────────
  const allRuns: Record<string, unknown>[] = [];
  const errors: { prompt: string; provider: string; error: string }[] = [];

  console.log(
    `[cron] Starting batch: ${validPrompts.length} prompt(s) × ${providers.length} provider(s)`,
  );

  for (const prompt of validPrompts) {
    for (const provider of providers) {
      const parsed = ProviderEnum.safeParse(provider);
      if (!parsed.success) continue;
      try {
        const result = await runAiScraper({
          provider: parsed.data,
          prompt: prompt.trim(),
          requireSources: true,
        });

        const answerText = result.answer || "";
        const sourceList = result.sources || [];

        allRuns.push({
          provider: result.provider,
          prompt: result.prompt,
          answer: answerText,
          sources: sourceList,
          createdAt: result.createdAt,
          visibilityScore: calcVisibilityScore(
            answerText,
            sourceList,
            brandTerms,
            websiteDomains,
          ),
          sentiment: detectSentiment(answerText, brandTerms),
          brandMentions: findMentions(answerText, brandTerms),
          competitorMentions: findMentions(answerText, competitorTerms),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ prompt: prompt.trim(), provider, error: msg });
        console.error(
          `[cron] Error scraping ${provider} for "${prompt.slice(0, 60)}": ${msg}`,
        );
      }
    }
  }

  // ── Detect drift ─────────────────────────────────────────────
  const existingRuns = (state.runs ?? []) as Record<string, unknown>[];
  const driftAlerts = detectDrift(allRuns as any[], existingRuns as any[]);

  // ── Push to in-memory log buffer ──────────────────────────────
  const now = new Date().toISOString();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const { pushLog } = await import("@/lib/server/log-buffer");
  pushLog({
    level: errors.length > 0 ? (allRuns.length > 0 ? "warn" : "error") : "info",
    message:
      errors.length > 0
        ? `Batch ran with ${errors.length} error(s): ${allRuns.length} result(s), ${driftAlerts.length} drift alert(s)`
        : `Batch complete: ${allRuns.length} result(s) across ${validPrompts.length} prompt(s) × ${providers.length} provider(s)`,
    details:
      errors.length > 0
        ? errors
            .map((e) => `[${e.provider}] ${e.prompt.slice(0, 50)} → ${e.error}`)
            .join("; ")
        : undefined,
    totalRuns: allRuns.length,
    driftAlerts: driftAlerts.length,
    errors: errors.length,
    elapsedSeconds: Number(elapsed),
  });

  // ── Save updated state ───────────────────────────────────────
  const updatedState = {
    ...state,
    runs: [...allRuns, ...existingRuns].slice(0, 500),
    lastScheduledRun: now,
    driftAlerts: [
      ...driftAlerts,
      ...((state.driftAlerts ?? []) as any[]),
    ].slice(0, 100),
  };

  await kvSet(storageKey, updatedState);

  console.log(
    `[cron] Batch complete: ${allRuns.length} runs, ${driftAlerts.length} drift alert(s), ${errors.length} error(s) in ${elapsed}s`,
  );

  // ── Response ─────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    workspace: wsId,
    storageKey,
    promptsRun: validPrompts.length,
    providersPerPrompt: providers.length,
    totalRuns: allRuns.length,
    driftAlertsCreated: driftAlerts.length,
    errors: errors.length > 0 ? errors : undefined,
    elapsedSeconds: Number(elapsed),
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/cron/run-all?workspace=default&secret=...
 *
 * Convenience for cron systems that can only do GET requests.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
