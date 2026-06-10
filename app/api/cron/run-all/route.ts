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

async function isValidDashboardSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return false;

  try {
    const secret = process.env.AUTH_SECRET || "sovereign-default-secret-change-in-production";
    const parts = token.split(".");
    if (parts.length !== 2) return false;

    const [payloadB64, signatureB64] = parts;
    
    // HMAC SHA-256 validation
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
    const expectedSig = Buffer.from(sig).toString("base64url");

    if (signatureB64 !== expectedSig) return false;

    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadJson);

    if (payload.exp && payload.exp < Date.now()) return false;

    return true;
  } catch {
    return false;
  }
}

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
 *       Also allows dashboard session authenticated requests (auth_token cookie).
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
    
    const isDashboardUser = await isValidDashboardSession(req);
    
    if (authHeader !== cronSecret && querySecret !== cronSecret && !isDashboardUser) {
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

  const brandName = brand.brandName?.trim() || "our brand";
  const prompts: string[] =
    customPrompts.length > 0
      ? customPrompts.map((p: unknown) => {
          const text = typeof p === "string" ? p : (p as { text: string }).text;
          return text.replace(/\{brand\}/gi, brandName);
        })
      : [mainPrompt.replace(/\{brand\}/gi, brandName)];

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
  const driftAlerts = detectDrift(
    allRuns as Parameters<typeof detectDrift>[0],
    existingRuns as Parameters<typeof detectDrift>[1],
  );

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
      ...((state.driftAlerts ?? []) as ReturnType<typeof detectDrift>),
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
