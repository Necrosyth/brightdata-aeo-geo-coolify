import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isCloudStorageConfigured } from "@/lib/server/cloud-config";
import { testConnection } from "@/lib/server/neon";
import {
  getMigrationStatus,
  runPendingMigrations,
  runMigration,
  revertMigration,
} from "@/lib/server/migrations/migration-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notConfigured() {
  return NextResponse.json(
    { error: "Database is not configured on this deployment." },
    { status: 501 },
  );
}

/**
 * GET /api/migrations
 *
 * Returns the current migration status including:
 * - db status (connected or not)
 * - list of applied migrations
 * - list of pending migrations
 * - list of registered migrations
 */
export async function GET() {
  if (!isCloudStorageConfigured()) return notConfigured();

  // First test the connection
  const dbStatus = await testConnection();

  if (!dbStatus.ok) {
    return NextResponse.json({
      db: { ok: false, error: dbStatus.error },
      applied: [],
      pending: [],
      registered: [],
    });
  }

  const status = await getMigrationStatus();
  return NextResponse.json({
    db: dbStatus,
    ...status,
  });
}

/**
 * POST /api/migrations
 *
 * Run all pending migrations. Optionally run a specific migration
 * by providing `{ name: "001-initial" }` in the body.
 *
 * To revert: `{ name: "001-initial", action: "revert" }`
 */
const PostSchema = z.object({
  name: z.string().optional(),
  action: z.enum(["up", "revert"]).optional(),
});

export async function POST(req: NextRequest) {
  if (!isCloudStorageConfigured()) return notConfigured();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body: expected optional {name?, action?}." },
      { status: 400 },
    );
  }

  const { name, action } = parsed.data;

  try {
    if (name && action === "revert") {
      const result = await revertMigration(name);
      return NextResponse.json({ results: [result] });
    } else if (name) {
      const result = await runMigration(name);
      return NextResponse.json({ results: [result] });
    } else {
      const results = await runPendingMigrations();
      return NextResponse.json({ results });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
