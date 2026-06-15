/**
 * Migration Engine — applies and tracks database schema migrations
 * from within the app itself. Each migration is a reversible JS module
 * with `up()` and `down()` functions.
 *
 * Migrations are tracked in the `public.migrations_meta` table, which
 * is created by the auto-init in neon.ts if it doesn't exist yet.
 */

import { query, queryAll, queryOne } from "@/lib/server/neon";
import { createHash } from "crypto";

// ── Types ──────────────────────────────────────────────────────────

export type Migration = {
  /** Human-readable name, used as the unique identifier (e.g. "001-initial") */
  name: string;
  /** Apply the migration */
  up: (ctx: MigrationContext) => Promise<void>;
  /** Revert the migration */
  down: (ctx: MigrationContext) => Promise<void>;
};

export type MigrationContext = {
  query: typeof query;
  queryAll: typeof queryAll;
  queryOne: typeof queryOne;
  log: (msg: string) => void;
};

export type MigrationRecord = {
  id: number;
  name: string;
  applied_at: string;
  checksum: string;
  duration_ms: number;
};

export type MigrationResult = {
  name: string;
  status: "applied" | "skipped" | "error";
  duration_ms: number;
  error?: string;
};

// ── Internal migration list (registered by addMigration) ───────────

const registeredMigrations: Migration[] = [];

/** Register a migration so the engine can discover it. */
export function addMigration(migration: Migration) {
  registeredMigrations.push(migration);
}

/** Get all registered migrations sorted by name. */
export function getRegisteredMigrations(): Migration[] {
  return [...registeredMigrations].sort((a, b) => a.name.localeCompare(b.name));
}

// ── Checksum helpers ───────────────────────────────────────────────

function computeChecksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex").slice(0, 64);
}

// ── Core engine ────────────────────────────────────────────────────

/**
 * Ensure the migrations_meta table exists (belt-and-suspenders —
 * neon.ts also creates this, but this guarantees it's there).
 */
async function ensureMetaTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS public.migrations_meta (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum VARCHAR(64) NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );
  `);
}

/**
 * Return all already-applied migrations, keyed by name.
 */
async function getAppliedMigrations(): Promise<Map<string, MigrationRecord>> {
  await ensureMetaTable();
  const rows = await queryAll<MigrationRecord>(
    "SELECT * FROM public.migrations_meta ORDER BY id ASC"
  );
  const map = new Map<string, MigrationRecord>();
  for (const row of rows) {
    map.set(row.name, row);
  }
  return map;
}

/**
 * Run all pending migrations that haven't been applied yet.
 * Returns results for each attempted migration.
 */
export async function runPendingMigrations(): Promise<MigrationResult[]> {
  const applied = await getAppliedMigrations();
  const results: MigrationResult[] = [];

  for (const migration of registeredMigrations) {
    if (applied.has(migration.name)) {
      results.push({
        name: migration.name,
        status: "skipped",
        duration_ms: 0,
      });
      continue;
    }

    const start = Date.now();
    try {
      const ctx: MigrationContext = {
        query,
        queryAll,
        queryOne,
        log: (msg: string) => console.log(`[migration/${migration.name}] ${msg}`),
      };

      await migration.up(ctx);

      const duration_ms = Date.now() - start;

      // Record the migration
      await query(
        `INSERT INTO public.migrations_meta (name, checksum, duration_ms)
         VALUES ($1, $2, $3)`,
        [migration.name, "", duration_ms]
      );

      console.log(
        `[migrations] Applied "${migration.name}" in ${duration_ms}ms`
      );
      results.push({ name: migration.name, status: "applied", duration_ms });
    } catch (error) {
      const duration_ms = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[migrations] Failed to apply "${migration.name}": ${message}`);
      results.push({
        name: migration.name,
        status: "error",
        duration_ms,
        error: message,
      });
    }
  }

  return results;
}

/**
 * Run a specific migration by name (re-runs it even if already applied).
 */
export async function runMigration(
  name: string
): Promise<MigrationResult> {
  const migration = registeredMigrations.find((m) => m.name === name);
  if (!migration) {
    return { name, status: "error", duration_ms: 0, error: `Migration "${name}" not found` };
  }

  const start = Date.now();
  try {
    const ctx: MigrationContext = {
      query,
      queryAll,
      queryOne,
      log: (msg: string) => console.log(`[migration/${migration.name}] ${msg}`),
    };

    await migration.up(ctx);

    const duration_ms = Date.now() - start;

    // Upsert record
    await query(
      `INSERT INTO public.migrations_meta (name, checksum, duration_ms)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET
         applied_at = NOW(),
         checksum = $2,
         duration_ms = $3`,
      [migration.name, "", duration_ms]
    );

    console.log(`[migrations] Re-applied "${migration.name}" in ${duration_ms}ms`);
    return { name: migration.name, status: "applied", duration_ms };
  } catch (error) {
    const duration_ms = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[migrations] Failed to apply "${migration.name}": ${message}`);
    return { name: migration.name, status: "error", duration_ms, error: message };
  }
}

/**
 * Revert a migration by running its `down()` function and removing the record.
 */
export async function revertMigration(
  name: string
): Promise<MigrationResult> {
  const migration = registeredMigrations.find((m) => m.name === name);
  if (!migration) {
    return { name, status: "error", duration_ms: 0, error: `Migration "${name}" not found` };
  }

  const start = Date.now();
  try {
    const ctx: MigrationContext = {
      query,
      queryAll,
      queryOne,
      log: (msg: string) => console.log(`[migration/${migration.name}] ${msg}`),
    };

    await migration.down(ctx);

    const duration_ms = Date.now() - start;

    await query("DELETE FROM public.migrations_meta WHERE name = $1", [name]);

    console.log(`[migrations] Reverted "${migration.name}" in ${duration_ms}ms`);
    return { name: migration.name, status: "applied", duration_ms };
  } catch (error) {
    const duration_ms = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[migrations] Failed to revert "${migration.name}": ${message}`);
    return { name: migration.name, status: "error", duration_ms, error: message };
  }
}

/**
 * Get the full status of all migrations (both applied and pending).
 */
export async function getMigrationStatus(): Promise<{
  applied: MigrationRecord[];
  pending: string[];
  registered: string[];
}> {
  const applied = await getAppliedMigrations();
  const registered = registeredMigrations.map((m) => m.name);
  const pending = registered.filter((name) => !applied.has(name));

  return {
    applied: Array.from(applied.values()),
    pending,
    registered,
  };
}
