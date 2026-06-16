import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/server/kv-store";
import { isCloudStorageConfigured } from "@/lib/server/cloud-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/reset-batch
 *
 * Clears a stuck batchRunning lock in the database.
 * Use this when a batch run crashed or timed out and the flag was never cleared.
 *
 * Auth: Requires CRON_SECRET env var as Bearer token or ?secret= param.
 *       Also allows dashboard session authenticated requests (auth_token cookie).
 *
 * Query params:
 *   workspace  - workspace ID (default: "default")
 *   secret     - CRON_SECRET if not using Authorization header
 */
export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    const querySecret = req.nextUrl.searchParams.get("secret");

    // Simple token check: allow if auth_token cookie is present (dashboard user)
    const token = req.cookies.get("auth_token")?.value;
    if (authHeader !== cronSecret && querySecret !== cronSecret && !token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Cloud storage check ──────────────────────────────────────
  if (!isCloudStorageConfigured()) {
    return NextResponse.json(
      { error: "Cloud storage (DATABASE_URL) is not configured." },
      { status: 501 },
    );
  }

  // ── Read current state ────────────────────────────────────────
  const wsId = req.nextUrl.searchParams.get("workspace") || "default";
  const storageKey =
    wsId === "default"
      ? "sovereign-aeo-tracker-v1"
      : `sovereign-aeo-tracker-${wsId}`;

  console.log(`[cron] Reset batch requested for workspace "${wsId}"`);

  const stateRes = await kvGet<Record<string, unknown>>(storageKey);
  if (!stateRes.ok || !stateRes.value) {
    return NextResponse.json(
      { error: `No stored state found for workspace "${wsId}".` },
      { status: 404 },
    );
  }
  const state = stateRes.value as Record<string, unknown>;

  const wasRunning = state.batchRunning === true;
  const lockAge = state.batchStartedAt
    ? Math.round(
        (Date.now() - new Date(state.batchStartedAt as string).getTime()) /
          1000,
      )
    : null;

  // ── Clear the lock ────────────────────────────────────────────
  await kvSet(storageKey, {
    ...state,
    batchRunning: false,
    batchStartedAt: null,
  });

  console.log(
    `[cron] Batch lock cleared (was running: ${wasRunning}, lock age: ${lockAge !== null ? `${lockAge}s` : "unknown"})`,
  );

  // Push log entry so it appears in the Logs tab (non-critical — don't let failure break response)
  try {
    const { pushLog } = await import("@/lib/server/log-buffer");
    await pushLog({
      level: "warn",
      message: wasRunning
        ? `Manual batch lock reset — cleared stuck lock (age: ${lockAge !== null ? `${lockAge}s` : "unknown"})`
        : "Manual batch reset requested — no stuck lock found",
      details: [
        `Workspace: ${wsId}`,
        wasRunning ? `Lock age: ${lockAge !== null ? `${lockAge}s` : "unknown"}` : "Lock was already clear",
        `Action: batchRunning cleared, batchStartedAt cleared`,
      ].join("\n"),
    });
  } catch {
    console.warn("[cron] Failed to push reset-batch log (non-critical)");
  }

  return NextResponse.json({
    success: true,
    workspace: wsId,
    wasRunning,
    lockAgeSeconds: lockAge,
    message: wasRunning
      ? `Cleared stuck batch lock (was running for ${lockAge !== null ? `${lockAge}s` : "unknown duration"}).`
      : "No stuck batch lock found — already clear.",
  });
}
