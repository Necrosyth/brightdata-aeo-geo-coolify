#!/bin/sh
# ─── Scheduler + Server Startup ──────────────────────────────────
# Runs the Next.js server and the scheduler worker in the same
# container. The worker polls Neon for scheduling state and triggers
# batch scrapes when the dashboard's "Auto-Run" is enabled.
#
# Both processes share the same environment variables.

set -e

echo "================================================"
echo "  geo-aeo-tracker — Starting containers"
echo "================================================"

# ── Start Next.js server in background ────────────
echo "[start] Starting Next.js server (node server.js)..."
node server.js &
NEXT_PID=$!
echo "[start] Next.js PID: $NEXT_PID"

# Give the server a moment to bind
sleep 3

# ── Start scheduler worker (if DATABASE_URL is set) ─
if [ -n "$DATABASE_URL" ]; then
  echo "[start] Starting scheduler worker..."
  node scripts/scheduler-worker.mjs &
  WORKER_PID=$!
  echo "[start] Worker PID: $WORKER_PID"
else
  echo "[start] DATABASE_URL not set — scheduler worker disabled"
  WORKER_PID=""
fi

# ── Trap signals for graceful shutdown ────────────
cleanup() {
  echo "[start] Shutting down..."
  [ -n "$WORKER_PID" ] && kill "$WORKER_PID" 2>/dev/null
  kill "$NEXT_PID" 2>/dev/null
  wait
  echo "[start] All processes stopped"
  exit 0
}

trap cleanup SIGTERM SIGINT

# ── Wait for any process to exit ─────────────────
echo "[start] Running. Press Ctrl+C to stop."
wait
