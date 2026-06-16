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

  const { pushLog } = await import("@/lib/server/log-buffer");

  // Check if a batch run is already in progress.
  // Auto-recover stale locks: if batchRunning has been true for >30 minutes,
  // treat it as a stuck/abandoned lock and clear it.
  const BATCH_STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  if (state.batchRunning === true) {
    const batchStartedAt = state.batchStartedAt
      ? new Date(state.batchStartedAt as string).getTime()
      : 0;
    const lockAge = batchStartedAt ? Date.now() - batchStartedAt : Infinity;

    if (lockAge < BATCH_STALE_THRESHOLD_MS) {
      console.log(
        `[cron] A batch run is already in progress (lock age: ${Math.round(lockAge / 1000)}s). Skipping.`,
      );
      return NextResponse.json(
        { error: "A batch run is already in progress." },
        { status: 409 },
      );
    }

    // Stale lock detected — clear it and proceed
    console.warn(
      `[cron] Stale batchRunning lock detected (age: ${Math.round(lockAge / 1000)}s). Auto-recovering.`,
    );
    await pushLog({
      level: "warn",
      message: `Auto-recovered stale batch lock (age: ${Math.round(lockAge / 1000)}s)`,
      details: `batchRunning was stuck at true since ${state.batchStartedAt ?? "unknown"}. Clearing and proceeding.`,
    });
  }

  // Set batchRunning: true in Neon with timestamp for stale detection
  await kvSet(storageKey, {
    ...state,
    batchRunning: true,
    batchStartedAt: new Date().toISOString(),
  });

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
    // Clear batchRunning flag before returning
    await kvSet(storageKey, {
      ...state,
      batchRunning: false,
    });
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
  const apiCallLog: {
    provider: string;
    prompt: string;
    status: "ok" | "error";
    durationMs: number;
    visibilityScore?: number;
    sentiment?: string;
    sourcesCount?: number;
    error?: string;
  }[] = [];
  let driftAlerts: ReturnType<typeof detectDrift> = [];
  let now = new Date().toISOString();
  let elapsed = "0.0";

  console.log(
    `[cron] Starting batch: ${validPrompts.length} prompt(s) × ${providers.length} provider(s)`,
  );

  // Log batch start
  await pushLog({
    level: "info",
    message: `Batch started: ${validPrompts.length} prompt(s) × ${providers.length} provider(s) — ${brand.brandName || "default"} workspace`,
    details: `Providers: ${providers.join(", ")}\nPrompts: ${validPrompts.map((p) => p.slice(0, 80)).join(" | ")}`,
  });

  try {
    let scrapeIndex = 0;
    for (const prompt of validPrompts) {
      for (const provider of providers) {
        scrapeIndex++;
        const parsed = ProviderEnum.safeParse(provider);
        if (!parsed.success) continue;

        const scrapeStart = Date.now();
        try {
          const result = await runAiScraper({
            provider: parsed.data,
            prompt: prompt.trim(),
            requireSources: true,
          });

          const scrapeDuration = Date.now() - scrapeStart;
          const answerText = result.answer || "";
          const sourceList = result.sources || [];
          const visScore = calcVisibilityScore(
            answerText,
            sourceList,
            brandTerms,
            websiteDomains,
          );
          const sent = detectSentiment(answerText, brandTerms);

          allRuns.push({
            provider: result.provider,
            prompt: result.prompt,
            answer: answerText,
            sources: sourceList,
            createdAt: result.createdAt,
            visibilityScore: visScore,
            sentiment: sent,
            brandMentions: findMentions(answerText, brandTerms),
            competitorMentions: findMentions(answerText, competitorTerms),
          });

          apiCallLog.push({
            provider,
            prompt: prompt.trim().slice(0, 80),
            status: "ok",
            durationMs: scrapeDuration,
            visibilityScore: visScore,
            sentiment: sent,
            sourcesCount: sourceList.length,
          });

          console.log(
            `[cron] ✓ ${scrapeIndex}/${validPrompts.length * providers.length} ${provider} (${scrapeDuration}ms) score=${visScore} sent=${sent} src=${sourceList.length}`,
          );
        } catch (err) {
          const scrapeDuration = Date.now() - scrapeStart;
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ prompt: prompt.trim(), provider, error: msg });
          apiCallLog.push({
            provider,
            prompt: prompt.trim().slice(0, 80),
            status: "error",
            durationMs: scrapeDuration,
            error: msg.slice(0, 200),
          });
          console.error(
            `[cron] ✗ ${scrapeIndex}/${validPrompts.length * providers.length} ${provider} (${scrapeDuration}ms) ERROR: ${msg.slice(0, 120)}`,
          );
        }
      }
    }

    // ── Detect drift ─────────────────────────────────────────────
    const existingRuns = (state.runs ?? []) as Record<string, unknown>[];
    driftAlerts = detectDrift(
      allRuns as Parameters<typeof detectDrift>[0],
      existingRuns as Parameters<typeof detectDrift>[1],
    );

    // ── Push detailed log entry ──────────────────────────────────
    now = new Date().toISOString();
    elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const successCount = apiCallLog.filter((c) => c.status === "ok").length;
    const avgScore =
      allRuns.length > 0
        ? Math.round(
            allRuns.reduce((a, r) => a + ((r as { visibilityScore?: number }).visibilityScore ?? 0), 0) /
              allRuns.length,
          )
        : 0;
    const avgDuration =
      apiCallLog.length > 0
        ? Math.round(
            apiCallLog.reduce((a, c) => a + c.durationMs, 0) / apiCallLog.length,
          )
        : 0;

    const logDetails = [
      `Results: ${allRuns.length} run(s), ${successCount} succeeded, ${errors.length} failed`,
      `Scores: avg=${avgScore}% ${allRuns.length > 0 ? `min=${Math.min(...allRuns.map((r) => (r as { visibilityScore?: number }).visibilityScore ?? 0))}% max=${Math.max(...allRuns.map((r) => (r as { visibilityScore?: number }).visibilityScore ?? 0))}%` : ""}`,
      `Timing: total=${elapsed}s avg_per_call=${avgDuration}ms`,
      driftAlerts.length > 0 ? `Drift: ${driftAlerts.length} alert(s) — ${driftAlerts.map((d) => `${d.prompt.slice(0, 40)} (${d.provider}): ${d.oldScore}→${d.newScore}`).join("; ")}` : "",
      errors.length > 0 ? `Errors:\n${errors.map((e) => `  [${e.provider}] ${e.prompt.slice(0, 50)} → ${e.error.slice(0, 100)}`).join("\n")}` : "",
      `API calls:\n${apiCallLog.map((c) => `  [${c.status}] ${c.prompt.slice(0, 40)} via ${c.provider} — ${c.durationMs}ms${c.visibilityScore !== undefined ? ` score=${c.visibilityScore}` : ""}${c.error ? ` err=${c.error.slice(0, 80)}` : ""}`).join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n");

    await pushLog({
      level: errors.length > 0 ? (allRuns.length > 0 ? "warn" : "error") : "info",
      message:
        errors.length > 0
          ? `Batch complete with ${errors.length} error(s): ${allRuns.length} result(s), ${driftAlerts.length} drift alert(s) in ${elapsed}s`
          : `Batch complete: ${allRuns.length} result(s) across ${validPrompts.length} prompt(s) × ${providers.length} provider(s) in ${elapsed}s`,
      details: logDetails,
      totalRuns: allRuns.length,
      driftAlerts: driftAlerts.length,
      errors: errors.length,
      elapsedSeconds: Number(elapsed),
    });

  } catch (error) {
    console.error("[cron] Unhandled error during batch scrape:", error);
    const msg = error instanceof Error ? error.message : String(error);
    errors.push({ prompt: "batch_scrape", provider: "all", error: msg });

    await pushLog({
      level: "error",
      message: `Batch failed: ${msg.slice(0, 200)}`,
      details: msg,
      totalRuns: 0,
      errors: 1,
    });
  } finally {
    // ── Save updated state ───────────────────────────────────────
    // Reload state to avoid race conditions with other updates
    const finalStateRes = await kvGet<Record<string, unknown>>(storageKey);
    const finalState = finalStateRes.ok && finalStateRes.value ? finalStateRes.value : state;

    const existingRuns = (finalState.runs ?? []) as Record<string, unknown>[];

    const updatedState = {
      ...finalState,
      runs: [...allRuns, ...existingRuns].slice(0, 500),
      lastScheduledRun: now,
      driftAlerts: [
        ...driftAlerts,
        ...((finalState.driftAlerts ?? []) as ReturnType<typeof detectDrift>),
      ].slice(0, 100),
      batchRunning: false,
      batchStartedAt: null,
    };

    await kvSet(storageKey, updatedState);

    console.log(
      `[cron] Batch complete: ${allRuns.length} runs, ${driftAlerts.length} drift alert(s), ${errors.length} error(s) in ${elapsed}s`,
    );
  }

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
