import { NextRequest, NextResponse } from "next/server";
import { kvGet } from "@/lib/server/kv-store";
import { isCloudStorageConfigured } from "@/lib/server/cloud-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/meers/analytics?workspace=default
 *
 * Returns all visibility analytics data including:
 *   - scrape runs (scores, sentiment, brand mentions per provider)
 *   - drift alerts
 *   - score trends over time
 *   - competitor battlecards
 */
export async function GET(req: NextRequest) {
  if (!isCloudStorageConfigured()) {
    return NextResponse.json(
      { error: "Cloud storage (Neon) is not configured." },
      { status: 501 },
    );
  }

  const wsId = req.nextUrl.searchParams.get("workspace") || "default";
  const storageKey =
    wsId === "default"
      ? "sovereign-aeo-tracker-v1"
      : `sovereign-aeo-tracker-${wsId}`;

  const res = await kvGet<Record<string, unknown>>(storageKey);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 500 });
  }
  if (!res.value) {
    return NextResponse.json(
      { error: "No data found for this workspace." },
      { status: 404 },
    );
  }

  const state = res.value;

  // Extract analytics-relevant fields
  const runs = (state.runs ?? []) as Array<{
    provider: string;
    prompt: string;
    visibilityScore: number;
    sentiment: string;
    brandMentions: string[];
    competitorMentions: string[];
    createdAt: string;
  }>;

  const driftAlerts = (state.driftAlerts ?? []) as Array<{
    id: string;
    prompt: string;
    provider: string;
    oldScore: number;
    newScore: number;
    delta: number;
    createdAt: string;
    dismissed: boolean;
  }>;

  const battlecards = (state.battlecards ?? []) as Array<{
    competitor: string;
    sentiment: string;
    summary: string;
  }>;

  // Compute per-provider average scores
  const providerScores: Record<string, number[]> = {};
  for (const run of runs) {
    if (!providerScores[run.provider]) providerScores[run.provider] = [];
    providerScores[run.provider].push(run.visibilityScore);
  }
  const providerAverages = Object.fromEntries(
    Object.entries(providerScores).map(([provider, scores]) => [
      provider,
      Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    ]),
  );

  // Latest run per provider
  const latestRuns: Record<string, typeof runs[0]> = {};
  for (const run of runs) {
    if (
      !latestRuns[run.provider] ||
      run.createdAt > latestRuns[run.provider].createdAt
    ) {
      latestRuns[run.provider] = run;
    }
  }

  return NextResponse.json({
    workspace: wsId,
    brand: state.brand ?? null,
    summary: {
      totalRuns: runs.length,
      totalDriftAlerts: driftAlerts.filter((d) => !d.dismissed).length,
      overallAvgScore: runs.length
        ? Math.round(
            runs.reduce((s, r) => s + r.visibilityScore, 0) / runs.length,
          )
        : null,
      providerAverages,
    },
    latestRuns,
    runs,
    driftAlerts,
    battlecards,
  });
}
