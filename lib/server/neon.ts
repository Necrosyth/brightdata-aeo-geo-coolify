import { Pool, QueryResult, QueryResultRow } from "pg";

let pool: Pool | null = null;
let tablesInitialized = false;

async function ensureTablesExist(p: Pool) {
  if (tablesInitialized) return;
  tablesInitialized = true; // Guard to prevent concurrent init attempts

  try {
    // Enable pgcrypto extension if needed for gen_random_uuid()
    await p.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    // Create public.kv_store table
    await p.query(`
      CREATE TABLE IF NOT EXISTS public.kv_store (
        key VARCHAR(512) PRIMARY KEY,
        value JSONB
      );
    `);

    // Create public.website_data table
    await p.query(`
      CREATE TABLE IF NOT EXISTS public.website_data (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_url TEXT NOT NULL,
        section_name TEXT NOT NULL,
        title TEXT,
        content TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_scraped_at TIMESTAMPTZ,
        UNIQUE(source_url, section_name)
      );
    `);

    // Create public.migrations_meta table (tracks applied migrations)
    await p.query(`
      CREATE TABLE IF NOT EXISTS public.migrations_meta (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum VARCHAR(64) NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0
      );
    `);

    console.log("Database tables initialized successfully");
  } catch (error) {
    console.error("Failed to initialize database tables:", error);
    tablesInitialized = false; // Allow retry on next query if it failed
  }
}

export function getNeonPool(): Pool | null {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn("DATABASE_URL not configured");
    return null;
  }

  try {
    pool = new Pool({
      connectionString,
      ssl: false,
    });

    pool.on("error", (err) => {
      console.error("Unexpected error on idle client", err);
    });

    return pool;
  } catch (error) {
    console.error("Failed to create connection pool:", error);
    return null;
  }
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  values?: any[],
): Promise<QueryResult<T>> {
  const pool = getNeonPool();
  if (!pool) {
    throw new Error("Database not configured");
  }

  // Ensure tables exist in the background or await it
  await ensureTablesExist(pool);

  try {
    return await pool.query<T>(text, values);
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

export async function queryOne<T extends QueryResultRow = any>(
  text: string,
  values?: any[],
): Promise<T | null> {
  const result = await query<T>(text, values);
  return result.rows[0] ?? null;
}

export async function queryAll<T extends QueryResultRow = any>(
  text: string,
  values?: any[],
): Promise<T[]> {
  const result = await query<T>(text, values);
  return result.rows;
}

/**
 * Test the database connection and return diagnostic info.
 */
export async function testConnection(): Promise<{
  ok: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const result = await queryOne<{ version: string }>("SELECT version()");
    return { ok: true, version: result?.version };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
