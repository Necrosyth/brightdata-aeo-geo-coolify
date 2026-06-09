/**
 * Server-side KV operations backed by Neon PostgreSQL `kv_store` table.
 * Mirrors the contract of lib/client/sovereign-store.ts so clients can
 * swap between local IndexedDB and cloud transparently.
 */
import { queryOne, queryAll, query } from "./neon";

export type KvResult<T> =
  | { ok: true; value: T | null }
  | { ok: false; error: string };

export async function kvGet<T = unknown>(key: string): Promise<KvResult<T>> {
  try {
    const result = await queryOne<{ value: unknown }>(
      "SELECT value FROM public.kv_store WHERE key = $1",
      [key],
    );
    return {
      ok: true,
      value: (result?.value ?? null) as T | null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function kvSet<T = unknown>(
  key: string,
  value: T,
): Promise<KvResult<null>> {
  try {
    // Explicitly serialize to JSON to prevent pg library type-inference
    // issues with JSONB columns (e.g. invalid input syntax for type json).
    const jsonValue = value === undefined ? null : JSON.stringify(value);
    await query(
      `INSERT INTO public.kv_store (key, value)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb`,
      [key, jsonValue],
    );
    return { ok: true, value: null };
  } catch (error) {
    console.error("kvSet error:", error, "key:", key);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function kvDelete(key: string): Promise<KvResult<null>> {
  try {
    await query("DELETE FROM public.kv_store WHERE key = $1", [key]);
    return { ok: true, value: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
