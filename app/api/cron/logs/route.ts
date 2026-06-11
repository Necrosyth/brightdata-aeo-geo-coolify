import { NextRequest, NextResponse } from "next/server";
import { getLogs, clearLogs, pushLog } from "@/lib/server/log-buffer";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/logs?limit=50
 *
 * Returns the persistent scheduler log buffer (Neon DB backed).
 * This is the data shown in the Logs sidebar tab.
 *
 * Query params:
 *   limit  - max entries to return (default: 100, max: 300)
 */
export async function GET(req: NextRequest) {
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(
    Math.max(1, parseInt(limitParam || "100", 10) || 100),
    300,
  );

  const allLogs = await getLogs();
  const logs = allLogs.slice(0, limit);

  return NextResponse.json({
    logs,
    total: allLogs.length,
    returned: logs.length,
  });
}

/**
 * POST /api/cron/logs
 *
 * Push a log entry to the buffer. Used by the dashboard's "Run Now"
 * button so its results also appear in the Logs tab.
 */
const PushSchema = z.object({
  level: z.enum(["info", "warn", "error"]),
  message: z.string().min(1),
  details: z.string().optional(),
  totalRuns: z.number().optional(),
  driftAlerts: z.number().optional(),
  errors: z.number().optional(),
  elapsedSeconds: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = PushSchema.parse(body);
    await pushLog(parsed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/**
 * DELETE /api/cron/logs
 *
 * Clears the persistent log buffer.
 */
export async function DELETE(_req: NextRequest) {
  await clearLogs();
  return NextResponse.json({ ok: true });
}
