import { NextRequest, NextResponse } from "next/server";
import { kvGet } from "@/lib/server/kv-store";
import { isCloudStorageConfigured } from "@/lib/server/cloud-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/meera/analytics?workspace=default
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

  // ── Calculate trends and distributions for charts ──
  
  // 1. Visibility trend (daily average score over time)
  const byDay = new Map<string, { total: number; sum: number }>();
  runs.forEach((run) => {
    const day = run.createdAt.slice(0, 10);
    const row = byDay.get(day) ?? { total: 0, sum: 0 };
    row.total += 1;
    row.sum += run.visibilityScore ?? 0;
    byDay.set(day, row);
  });
  const visibilityTrend = [...byDay.entries()]
    .map(([day, { total, sum }]) => ({
      day,
      visibility: total > 0 ? Math.round(sum / total) : 0,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // 2. Sentiment distribution
  const sentimentDistribution = {
    positive: 0,
    neutral: 0,
    negative: 0,
    "not-mentioned": 0,
  };
  runs.forEach((run) => {
    const s = run.sentiment || "not-mentioned";
    if (s === "positive") sentimentDistribution.positive++;
    else if (s === "neutral") sentimentDistribution.neutral++;
    else if (s === "negative") sentimentDistribution.negative++;
    else sentimentDistribution["not-mentioned"]++;
  });

  // 3. Top movers (score changes between runs)
  const grouped = new Map<string, typeof runs>();
  runs.forEach((run) => {
    const key = `${run.prompt}|||${run.provider}`;
    const list = grouped.get(key) ?? [];
    list.push(run);
    grouped.set(key, list);
  });
  const deltas: Array<{
    prompt: string;
    provider: string;
    currentScore: number;
    previousScore: number;
    delta: number;
  }> = [];
  grouped.forEach((groupRuns) => {
    const sorted = [...groupRuns].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (sorted.length < 2) return;
    const curr = sorted[0];
    const prev = sorted[1];
    const d = (curr.visibilityScore ?? 0) - (prev.visibilityScore ?? 0);
    if (d !== 0) {
      deltas.push({
        prompt: curr.prompt,
        provider: curr.provider,
        currentScore: curr.visibilityScore ?? 0,
        previousScore: prev.visibilityScore ?? 0,
        delta: d,
      });
    }
  });
  const topMovers = deltas
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

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
    charts: {
      visibilityTrend,
      sentimentDistribution,
      topMovers,
    },
  });
}
