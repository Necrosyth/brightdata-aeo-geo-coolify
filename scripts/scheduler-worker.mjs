/**
 * Scheduler Worker — Persistent in-container process
 *
 * Runs alongside the Next.js server and monitors the scheduling config
 * stored in Neon.  When the dashboard's "Auto-Run Scheduler" is enabled,
 * this worker automatically triggers batch scrapes on the configured interval.
 *
 * This eliminates the need for external cron services (Coolify cron, Vercel
 * cron, GitHub Actions, etc.) — the scheduler runs as long as the container
 * is alive.
 *
 * Environment variables:
 *   DATABASE_URL   – Neon PostgreSQL connection string (required)
 *   CRON_SECRET    – Secret for the cron endpoint (required)
 *   POLL_INTERVAL  – How often to check state (ms, default: 30_000 = 30s)
 *   WORKSPACE      – Workspace ID to monitor (default: "default")
 *   PORT           – Next.js server port (default: 3040)
 *   SCHEDULER_HOST – Internal host for the Next.js server (default: "localhost")
 *                   Note: the Dockerfile sets HOSTNAME=0.0.0.0 for binding,
 *                   but you must connect via localhost internally.
 *   LOG_LEVEL      – "debug" for verbose output (default: "info")
 */

import pg from "pg";
const { Pool } = pg;

// ── Config ─────────────────────────────────────────────────────
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "30000", 10);
const WORKSPACE = process.env.WORKSPACE || "default";
const CRON_SECRET = process.env.CRON_SECRET || "";
const APP_PORT = process.env.PORT || "3040";
// HOSTNAME in Docker is the container ID, and 0.0.0.0 can't be used to connect to.
// Use SCHEDULER_HOST to explicitly set the internal address, defaulting to "localhost".
const APP_HOST = process.env.SCHEDULER_HOST || "localhost";
const STORAGE_KEY =
  WORKSPACE === "default"
    ? "sovereign-aeo-tracker-v1"
    : `sovereign-aeo-tracker-${WORKSPACE}`;

const BASE_URL = `http://${APP_HOST}:${APP_PORT}`;
const DEBUG = (process.env.LOG_LEVEL || "info") === "debug";

const log = {
  info: (...args) => console.log("[scheduler]", ...args),
  debug: (...args) => {
    if (DEBUG) console.log("[scheduler:debug]", ...args);
  },
  warn: (...args) => console.warn("[scheduler:warn]", ...args),
  error: (...args) => console.error("[scheduler:error]", ...args),
};

// ── DB Connection ──────────────────────────────────────────────
function createPool() {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    log.error("DATABASE_URL is not set — worker cannot start");
    return null;
  }
  return new Pool({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 30_000,
  });
}

let pool = createPool();

// ── State helpers ─────────────────────────────────────────────
async function readScheduleState() {
  if (!pool) return null;
  try {
    // Test connection
    await pool.query("SELECT 1");
  } catch {
    // Reconnect on failure
    try {
      await pool.end();
    } catch {}
    pool = createPool();
    if (!pool) return null;
  }

  try {
    const result = await pool.query(
      "SELECT value FROM public.kv_store WHERE key = $1",
      [STORAGE_KEY],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].value;
  } catch (err) {
    log.error("Failed to read schedule state:", err.message);
    return null;
  }
}

function shouldRun(state) {
  if (!state) return false;
  if (!state.scheduleEnabled) return false;

  const intervalMs = state.scheduleIntervalMs;
  if (!intervalMs || intervalMs <= 0) return false;

  const lastRun = state.lastScheduledRun;
  if (!lastRun) return true; // Never run before — go!

  const elapsed = Date.now() - new Date(lastRun).getTime();
  return elapsed >= intervalMs;
}

// ── Trigger batch ──────────────────────────────────────────────
async function triggerBatch() {
  const url = `${BASE_URL}/api/cron/run-all?workspace=${WORKSPACE}`;
  const headers = { "Content-Type": "application/json" };
  if (CRON_SECRET) {
    headers["Authorization"] = `Bearer ${CRON_SECRET}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      // Timeout after 5 minutes — Bright Data scrapes can be slow
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "no body");
      log.error(`Batch trigger failed (${res.status}): ${text.slice(0, 200)}`);
      return;
    }

    const data = await res.json();
    log.info(
      `Batch complete: ${data.totalRuns ?? 0} run(s), ` +
        `${data.driftAlertsCreated ?? 0} drift alert(s), ` +
        `${data.elapsedSeconds ?? "?"}s`,
    );
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      log.warn("Batch trigger timed out (5 min) — next poll will retry");
    } else if (err.code === "ECONNREFUSED") {
      log.debug("Server not ready yet — skipping this poll cycle");
    } else {
      log.error(`Batch trigger error: ${err.message}`);
    }
  }
}

// ── Main loop ──────────────────────────────────────────────────
let consecutiveFailures = 0;
let lastRunTime = 0;

async function tick() {
  try {
    const state = await readScheduleState();

    if (DEBUG && state) {
      log.debug(
        `scheduleEnabled=${!!state.scheduleEnabled}, ` +
          `lastScheduledRun=${state.lastScheduledRun ?? "never"}, ` +
          `intervalMs=${state.scheduleIntervalMs ?? "N/A"}`,
      );
    }

    if (shouldRun(state)) {
      const cooldown = Date.now() - lastRunTime;
      if (cooldown < 10_000) {
        log.debug("Skipping — too soon since last trigger (cooldown)");
        return;
      }

      log.info(
        `Schedule triggered: running batch (interval=${state.scheduleIntervalMs}ms)`,
      );
      lastRunTime = Date.now();
      await triggerBatch();
      consecutiveFailures = 0;
    }
  } catch (err) {
    consecutiveFailures++;
    log.error(`Tick error: ${err.message}`);
    if (consecutiveFailures > 10) {
      log.warn(
        `${consecutiveFailures} consecutive failures — will keep retrying`,
      );
    }
  }
}

// ── Startup ────────────────────────────────────────────────────
log.info(
  `Starting (poll=${POLL_INTERVAL}ms, workspace="${WORKSPACE}", ` +
    `endpoint=${BASE_URL}/api/cron/run-all)`,
);

if (!CRON_SECRET) {
  log.warn("CRON_SECRET is not set — endpoint is unprotected!");
}

// Delay first tick to let the Next.js server start
const startupDelay = Math.min(POLL_INTERVAL, 10_000);
setTimeout(() => {
  tick();
  setInterval(tick, POLL_INTERVAL);
}, startupDelay);

log.info(
  `First check in ${startupDelay / 1000}s, then every ${POLL_INTERVAL / 1000}s`,
);

// ── Graceful shutdown ─────────────────────────────────────────
process.on("SIGTERM", async () => {
  log.info("Shutting down...");
  if (pool) {
    try {
      await pool.end();
    } catch {}
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  log.info("Shutting down...");
  if (pool) {
    try {
      await pool.end();
    } catch {}
  }
  process.exit(0);
});
