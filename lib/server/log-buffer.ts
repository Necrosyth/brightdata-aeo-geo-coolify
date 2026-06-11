/**
 * Persistent scheduler log store.
 *
 * Logs are persisted in Neon PostgreSQL via the KV store so they survive
 * container restarts. An in-memory cache is kept for fast reads and to
 * avoid hammering the DB on every Logs-tab poll.
 */

import { kvGet, kvSet } from "./kv-store";

export type LogEntry = {
  level: "info" | "warn" | "error";
  message: string;
  details?: string;
  totalRuns?: number;
  driftAlerts?: number;
  errors?: number;
  elapsedSeconds?: number;
};

export type StoredLogEntry = LogEntry & { id: string; timestamp: string };

const STORAGE_KEY = "sovereign-logs-v1";
const MAX_LOGS = 300;
const MAX_DETAILS_CHARS = 2048;

/** In-memory cache — populated from DB on first read, kept in sync on writes */
let cache: StoredLogEntry[] = [];
let cacheLoaded = false;

async function ensureCacheLoaded(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const res = await kvGet<StoredLogEntry[]>(STORAGE_KEY);
    if (res.ok) {
      cache = Array.isArray(res.value) ? res.value : [];
      cacheLoaded = true;
    }
    // If !res.ok (DB error), leave cacheLoaded false to retry next time
  } catch {
    // DB temporarily unavailable — leave cacheLoaded false so we retry next time
    // This prevents overwriting existing DB logs with an empty cache
  }
}

function truncateDetails(details: string | undefined): string | undefined {
  if (!details) return undefined;
  return details.length > MAX_DETAILS_CHARS
    ? details.slice(0, MAX_DETAILS_CHARS) + "…"
    : details;
}

async function persistCache(): Promise<void> {
  try {
    await kvSet(STORAGE_KEY, cache.slice(0, MAX_LOGS));
  } catch (err) {
    console.error("[log-buffer] Failed to persist logs:", err);
  }
}

let idCounter = 0;

export async function pushLog(entry: LogEntry): Promise<void> {
  await ensureCacheLoaded();

  idCounter++;
  const stored: StoredLogEntry = {
    ...entry,
    details: truncateDetails(entry.details),
    id: `log-${Date.now()}-${idCounter}`,
    timestamp: new Date().toISOString(),
  };

  // Most recent first
  cache.unshift(stored);
  if (cache.length > MAX_LOGS) {
    cache.length = MAX_LOGS;
  }

  // Persist to DB (fire-and-forget for speed)
  persistCache();
}

export async function getLogs(): Promise<StoredLogEntry[]> {
  await ensureCacheLoaded();
  return cache;
}

export async function clearLogs(): Promise<void> {
  cache = [];
  cacheLoaded = true;
  try {
    await kvSet(STORAGE_KEY, []);
  } catch {
    // ignore
  }
}
