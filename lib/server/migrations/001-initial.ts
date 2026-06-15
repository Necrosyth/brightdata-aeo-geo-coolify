/**
 * 001-initial — Create the core tables for the geo-aeo-tracker app.
 *
 * This migration formalises the tables that neon.ts previously created
 * on-the-fly, plus the migrations_meta table. It is idempotent by design
 * (uses IF NOT EXISTS).
 */

import type { Migration, MigrationContext } from "./migration-engine";

export const initialMigration: Migration = {
  name: "001-initial",

  async up(ctx: MigrationContext) {
    // Enable pgcrypto for gen_random_uuid()
    await ctx.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    // ── kv_store: generic key-value store for app state ──
    await ctx.query(`
      CREATE TABLE IF NOT EXISTS public.kv_store (
        key VARCHAR(512) PRIMARY KEY,
        value JSONB
      );
    `);

    // ── website_data: scraped website content ──
    await ctx.query(`
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

    // ── scheduler_logs: persistent scheduler logs ──
    await ctx.query(`
      CREATE TABLE IF NOT EXISTS public.scheduler_logs (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        level TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        details TEXT,
        total_runs INTEGER,
        drift_alerts INTEGER,
        errors INTEGER,
        elapsed_seconds NUMERIC
      );
    `);

    // Create index for log queries
    await ctx.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduler_logs_timestamp
      ON public.scheduler_logs (timestamp DESC);
    `);

    // ── migrations_meta: track applied migrations ──
    await ctx.query(`
      CREATE TABLE IF NOT EXISTS public.migrations_meta (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum VARCHAR(64) NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0
      );
    `);

    ctx.log("Created core tables: kv_store, website_data, scheduler_logs, migrations_meta");
  },

  async down(ctx: MigrationContext) {
    // Drop tables in reverse order
    await ctx.query(`DROP TABLE IF EXISTS public.migrations_meta;`);
    await ctx.query(`DROP TABLE IF EXISTS public.scheduler_logs;`);
    await ctx.query(`DROP TABLE IF EXISTS public.website_data;`);
    await ctx.query(`DROP TABLE IF EXISTS public.kv_store;`);
    ctx.log("Dropped core tables");
  },
};
