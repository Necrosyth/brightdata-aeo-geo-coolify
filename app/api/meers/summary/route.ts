import { NextRequest, NextResponse } from "next/server";
import { kvGet } from "@/lib/server/kv-store";
import { isCloudStorageConfigured } from "@/lib/server/cloud-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/meers/summary?workspace=default
 *
 * Returns a compact summary of the entire tracker dashboard:
 *   - brand info
 *   - overall visibility snapshot with latest scores per provider
 *   - latest AEO audit score
 *   - active drift alerts count
 *   - total runs tracked
 *   - last updated timestamp
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
  const brand = state.brand as Record<string, unknown> | undefined;
  const runs = (state.runs ?? []) as Array<{
    provider: string;
    visibilityScore: number;
    sentiment: string;
    createdAt: string;
  }>;
  const auditReport = state.auditReport as Record<string, unknown> | null;
  const driftAlerts = (state.driftAlerts ?? []) as Array<{ dismissed: boolean }>;

  // Latest score per provider
  const latestScores: Record<string, number> = {};
  let latestTimestamp: string | null = null;
  for (const run of runs) {
    if (
      !latestScores[run.provider] ||
      run.createdAt > latestTimestamp!
    ) {
      latestScores[run.provider] = run.visibilityScore;
    }
    if (!latestTimestamp || run.createdAt > latestTimestamp) {
      latestTimestamp = run.createdAt;
    }
  }

  // Overall average
  const allScores = Object.values(latestScores);
  const overallScore =
    allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : null;

  return NextResponse.json({
    workspace: wsId,
    brand: brand
      ? {
          name: brand.brandName ?? null,
          industry: brand.industry ?? null,
          websites: brand.websites ?? [],
          description: brand.description ?? null,
        }
      : null,
    visibility: {
      overallScore,
      providerScores: latestScores,
      totalRuns: runs.length,
      activeDriftAlerts: driftAlerts.filter((d) => !d.dismissed).length,
    },
    audit: auditReport
      ? {
          url: state.auditUrl ?? null,
          score: (auditReport as Record<string, unknown>).score ?? null,
        }
      : null,
    lastUpdated: latestTimestamp,
  });
}
