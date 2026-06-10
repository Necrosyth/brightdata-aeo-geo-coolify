import { NextRequest, NextResponse } from "next/server";
import { kvGet } from "@/lib/server/kv-store";
import { isCloudStorageConfigured } from "@/lib/server/cloud-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/meera/aeo?workspace=default
 *
 * Returns AEO audit data and SRO (Search Result Optimization) analysis:
 *   - latest AEO audit report (llms.txt, schema, BLUF, headings, etc.)
 *   - SRO scores and recommendations
 *   - citation opportunities
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
  const brand = (state.brand ?? {}) as { brandName?: string };
  const brandName = brand.brandName || "your brand";

  const auditReport = state.auditReport ?? null;
  const auditUrl = state.auditUrl ?? null;

  // SRO analysis results (stored as part of bulk or individual runs)
  // These may be in custom keys or embedded in the state
  const sroResults = state.sroResults ?? null;

  // Citation opportunities
  let citationOpportunities = state.citationOpportunities ?? null;
  if (!citationOpportunities && Array.isArray(state.runs)) {
    const domains = new Set<string>();
    (state.runs as Array<{ brandMentions?: unknown; sentiment?: string; sources?: string[] }>).forEach((run) => {
      const brandMentionsCount = Array.isArray(run.brandMentions) ? run.brandMentions.length : 0;
      if (run.sentiment === "not-mentioned" || brandMentionsCount === 0) {
        if (Array.isArray(run.sources)) {
          run.sources.forEach((url: string) => {
            try {
              const host = new URL(url).hostname
                .replace(/^www\./, "")
                .toLowerCase();
              domains.add(host);
            } catch {
              /* skip */
            }
          });
        }
      }
    });
    citationOpportunities = Array.from(domains).map((domain) => ({
      domain,
      description: `Competitor cited but "${brandName}" is not mentioned.`,
    }));
  }

  return NextResponse.json({
    workspace: wsId,
    brand: state.brand ?? null,
    audit: {
      url: auditUrl,
      report: auditReport,
    },
    sro: sroResults,
    citationOpportunities,
  });
}
