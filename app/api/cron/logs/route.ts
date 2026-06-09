import { NextRequest, NextResponse } from "next/server";
import { getLogs, clearLogs } from "@/lib/server/log-buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/logs?limit=50
 *
 * Returns the in-memory scheduler log buffer.
 * This is the data shown in the Logs sidebar tab.
 *
 * Query params:
 *   limit  - max entries to return (default: 100, max: 200)
 */
export async function GET(req: NextRequest) {
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(1, parseInt(limitParam || "100", 10) || 100), 200);

  const allLogs = getLogs();
  const logs = allLogs.slice(0, limit);

  return NextResponse.json({
    logs,
    total: allLogs.length,
    returned: logs.length,
  });
}

/**
 * DELETE /api/cron/logs
 *
 * Clears the in-memory log buffer.
 */
export async function DELETE(_req: NextRequest) {
  clearLogs();
  return NextResponse.json({ ok: true });
}
