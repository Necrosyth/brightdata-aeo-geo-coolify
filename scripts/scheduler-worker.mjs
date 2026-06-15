/**
 * Scheduler Worker — Persistent in-container process
 *
 * Runs alongside the Next.js server and monitors the scheduling config
 * stored in the database.  When the dashboard's "Auto-Run Scheduler" is enabled,
 * this worker automatically triggers batch scrapes on the configured interval.
 *
 * This eliminates the need for external cron services (Coolify cron, Vercel
 * cron, GitHub Actions, etc.) — the scheduler runs as long as the container
 * is alive.
 *
 * Environment variables:
 *   DATABASE_URL   – PostgreSQL connection string (required)
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
    ssl: false,
    max: 1,
    idleTimeoutMillis: 30_000,
  });
}

let pool = createPool();

// ── Scheduler log via API ──────────────────────────────────────

/**
 * Push a log entry to the persistent log store via the server API.
 * This avoids race conditions between the worker process and the
 * Next.js server both writing to the same DB key.
 */
async function pushSchedulerLog(entry) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (CRON_SECRET) {
      headers["Authorization"] = `Bearer ${CRON_SECRET}`;
    }

    const res = await fetch(`${BASE_URL}/api/cron/logs`, {
      method: "POST",
      headers,
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      log.warn(`Failed to push scheduler log via API: ${res.status}`);
    }
  } catch (err) {
    // Log to console as fallback — don't let log persistence failures crash the worker
    log.debug(`Log push failed (non-critical): ${err.message}`);
  }
}

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

/**
 * Update lastScheduledRun in the database BEFORE triggering the batch.
 * This prevents the worker from re-triggering on every poll cycle
 * if the batch fails or times out (which keeps credits safe).
 */
async function markBatchStarted() {
  if (!pool) return;
  const now = new Date().toISOString();
  try {
    await pool.query(
      `UPDATE public.kv_store SET value = jsonb_set(value, '{lastScheduledRun}', $1::jsonb, true) WHERE key = $2`,
      [JSON.stringify(now), STORAGE_KEY],
    );
    log.debug(`Marked lastScheduledRun = ${now}`);
  } catch (err) {
    log.warn(`Failed to mark batch start (will retry): ${err.message}`);
  }
}

// ── Trigger batch ──────────────────────────────────────────────
async function triggerBatch() {
  const triggerStart = Date.now();
  const url = `${BASE_URL}/api/cron/run-all?workspace=${WORKSPACE}`;
  const headers = { "Content-Type": "application/json" };
  if (CRON_SECRET) {
    headers["Authorization"] = `Bearer ${CRON_SECRET}`;
  }

  log.info(`Triggering batch scrape...`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      // Timeout after 5 minutes — Bright Data scrapes can be slow
      signal: AbortSignal.timeout(300_000),
    });

    const triggerDuration = Date.now() - triggerStart;

    if (!res.ok) {
      const text = await res.text().catch(() => "no body");
      log.error(`Batch trigger failed (${res.status}): ${text.slice(0, 200)}`);
      await pushSchedulerLog({
        level: "error",
        message: `Batch trigger failed: HTTP ${res.status}`,
        details: text.slice(0, 500),
      });
      return;
    }

    const data = await res.json();
    log.info(
      `Batch complete: ${data.totalRuns ?? 0} run(s), ` +
        `${data.driftAlertsCreated ?? 0} drift alert(s), ` +
        `${data.elapsedSeconds ?? "?"}s`,
    );

    // The run-all route already pushes a detailed log, but we add a scheduler-level log too
    await pushSchedulerLog({
      level: data.errors ? "warn" : "info",
      message: `Scheduler batch complete: ${data.totalRuns ?? 0} result(s) in ${data.elapsedSeconds ?? "?"}s`,
      details: [
        `Trigger: scheduler worker → /api/cron/run-all`,
        `Prompts: ${data.promptsRun ?? "?"} × Providers: ${data.providersPerPrompt ?? "?"}`,
        `Results: ${data.totalRuns ?? 0} run(s), ${data.driftAlertsCreated ?? 0} drift alert(s), ${data.errors ?? 0} error(s)`,
        `Wall time: ${triggerDuration}ms (server processing: ${data.elapsedSeconds ?? "?"}s)`,
        data.errors ? `Errors: ${JSON.stringify(data.errors)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      totalRuns: data.totalRuns,
      driftAlerts: data.driftAlertsCreated,
      errors: data.errors,
      elapsedSeconds: data.elapsedSeconds,
    });
  } catch (err) {
    const triggerDuration = Date.now() - triggerStart;
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      log.warn("Batch trigger timed out (5 min) — next poll will retry");
      await pushSchedulerLog({
        level: "error",
        message: `Batch trigger timed out after ${triggerDuration}ms`,
        details:
          "The /api/cron/run-all endpoint did not respond within 5 minutes. This usually means a Bright Data scrape is hanging or the server is overloaded.",
      });
    } else if (err.code === "ECONNREFUSED") {
      log.debug("Server not ready yet — skipping this poll cycle");
    } else {
      log.error(`Batch trigger error: ${err.message}`);
      await pushSchedulerLog({
        level: "error",
        message: `Batch trigger error: ${err.message}`,
        details: `Duration: ${triggerDuration}ms\n${err.stack || ""}`,
      });
    }
  }
}

// ── Main loop ──────────────────────────────────────────────────
let consecutiveFailures = 0;
let lastRunTime = 0;
let totalPolls = 0;
let totalTriggers = 0;
let lastStatusLog = 0;

async function tick() {
  totalPolls++;
  try {
    const state = await readScheduleState();

    if (DEBUG && state) {
      log.debug(
        `scheduleEnabled=${!!state.scheduleEnabled}, ` +
          `lastScheduledRun=${state.lastScheduledRun ?? "never"}, ` +
          `intervalMs=${state.scheduleIntervalMs ?? "N/A"}`,
      );
    }

    // Periodic status log every 10 minutes
    if (Date.now() - lastStatusLog > 600_000) {
      lastStatusLog = Date.now();
      log.info(
        `Status: polls=${totalPolls}, triggers=${totalTriggers}, ` +
          `failures=${consecutiveFailures}, ` +
          `enabled=${!!state?.scheduleEnabled}, ` +
          `interval=${state?.scheduleIntervalMs ?? "N/A"}ms`,
      );
    }

    if (shouldRun(state)) {
      const cooldown = Date.now() - lastRunTime;
      if (cooldown < 10_000) {
        log.debug("Skipping — too soon since last trigger (cooldown)");
        return;
      }

      totalTriggers++;
      log.info(
        `Schedule triggered: running batch (interval=${state.scheduleIntervalMs}ms, ` +
          `last run=${state.lastScheduledRun ?? "never"})`,
      );
      await pushSchedulerLog({
        level: "info",
        message: `Scheduler triggered batch run (interval: ${formatInterval(state.scheduleIntervalMs)}, last run: ${state.lastScheduledRun ? new Date(state.lastScheduledRun).toISOString().slice(0, 19).replace("T", " ") : "never"})`,
      });
      lastRunTime = Date.now();
      // Mark start in DB BEFORE trigger so a timeout doesn't cause
      // infinite re-triggers on every poll cycle
      await markBatchStarted();
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

/** Format interval ms to human-readable */
function formatInterval(ms) {
  if (!ms) return "unknown";
  const hours = ms / 3_600_000;
  if (hours >= 24) return `${hours / 24}d`;
  if (hours >= 1) return `${hours}h`;
  return `${ms / 60_000}m`;
}

// ── Startup ────────────────────────────────────────────────────
log.info(
  `Starting (poll=${POLL_INTERVAL}ms, workspace="${WORKSPACE}", ` +
    `endpoint=${BASE_URL}/api/cron/run-all)`,
);

if (!CRON_SECRET) {
  log.warn("CRON_SECRET is not set — endpoint is unprotected!");
}

// Log startup to DB
pushSchedulerLog({
  level: "info",
  message: `Scheduler worker started`,
  details: [
    `Poll interval: ${POLL_INTERVAL}ms (${POLL_INTERVAL / 1000}s)`,
    `Workspace: ${WORKSPACE}`,
    `Endpoint: ${BASE_URL}/api/cron/run-all`,
    `CRON_SECRET: ${CRON_SECRET ? "configured" : "NOT SET (unprotected)"}`,
    `PID: ${process.pid}`,
    `Node: ${process.version}`,
  ].join("\n"),
}).catch(() => {});

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
  await pushSchedulerLog({
    level: "info",
    message: "Scheduler worker shutting down (SIGTERM)",
  }).catch(() => {});
  if (pool) {
    try {
      await pool.end();
    } catch {}
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  log.info("Shutting down...");
  await pushSchedulerLog({
    level: "info",
    message: "Scheduler worker shutting down (SIGINT)",
  }).catch(() => {});
  if (pool) {
    try {
      await pool.end();
    } catch {}
  }
  process.exit(0);
});
