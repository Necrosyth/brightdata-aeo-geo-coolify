"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type LogEntry = {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  details?: string;
  totalRuns?: number;
  driftAlerts?: number;
  errors?: number;
  elapsedSeconds?: number;
};

const LEVEL_STYLES: Record<
  LogEntry["level"],
  { dot: string; bg: string; label: string }
> = {
  info: { dot: "bg-th-success", bg: "bg-th-success-soft/40", label: "INFO" },
  warn: { dot: "bg-yellow-500", bg: "bg-yellow-500/10", label: "WARN" },
  error: { dot: "bg-th-danger", bg: "bg-th-danger-soft/40", label: "ERROR" },
};

export function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "info" | "warn" | "error">(
    "all",
  );
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/cron/logs?limit=300", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch logs");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Poll every 5 seconds while tab is active
  useEffect(() => {
    pollingRef.current = setInterval(fetchLogs, 5000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchLogs]);

  const clearLogs = async () => {
    try {
      await fetch("/api/cron/logs", { method: "DELETE" });
      setLogs([]);
    } catch {
      // ignore
    }
  };

  const filteredLogs =
    filter === "all" ? logs : logs.filter((l) => l.level === filter);

  // ── Empty / Loading state ──
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-center rounded-xl border border-th-border bg-th-card py-16">
          <div className="flex flex-col items-center gap-3">
            <svg
              className="animate-spin h-6 w-6 text-th-accent"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-sm text-th-text-muted">Loading logs…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && logs.length === 0) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-th-border bg-th-card-alt py-16">
          <p className="text-sm font-medium text-th-danger">
            Could not load logs
          </p>
          <p className="mt-1 text-xs text-th-text-muted">{error}</p>
          <button
            onClick={fetchLogs}
            className="mt-4 rounded-lg bg-th-accent px-4 py-2 text-xs font-medium text-th-text-inverse"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-xl border border-th-border bg-th-card p-4">
          <h2 className="text-sm font-semibold text-th-text">Scheduler Logs</h2>
          <p className="mt-1 text-xs text-th-text-muted">
            Persistent logs stored in Neon DB. Auto-refreshes every 5s.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-th-border bg-th-card-alt py-16">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mb-4 text-th-text-muted/40"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <p className="text-sm font-medium text-th-text-muted">No logs yet</p>
          <p className="mt-1 text-xs text-th-text-muted/60 text-center max-w-sm">
            Logs appear here after the server-side scheduler runs a batch
            scrape. Enable Auto-Run in the Automation tab to get started.
          </p>
        </div>
        <div className="rounded-xl border border-th-border bg-th-card-alt p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-th-text-muted">
            How Logs Work
          </h3>
          <div className="grid gap-3 text-xs text-th-text-secondary sm:grid-cols-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-th-accent-soft text-[10px] font-bold text-th-text-accent">
                1
              </span>
              <span>
                The scheduler worker polls Neon every 30s for the scheduling
                config.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-th-accent-soft text-[10px] font-bold text-th-text-accent">
                2
              </span>
              <span>
                When Auto-Run is enabled and the interval elapses, it triggers a
                batch scrape.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-th-accent-soft text-[10px] font-bold text-th-text-accent">
                3
              </span>
              <span>
                Each run produces a detailed log entry with results, API call
                details, drift alerts, and errors — persisted to Neon DB.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-th-border bg-th-card p-4">
        <div>
          <h2 className="text-sm font-semibold text-th-text">Scheduler Logs</h2>
          <p className="mt-0.5 text-xs text-th-text-muted">
            {logs.length} event{logs.length !== 1 ? "s" : ""} · persistent · live
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-th-border">
            {(["all", "info", "warn", "error"] as const).map((level) => (
              <button
                key={level}
                onClick={() => setFilter(level)}
                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  filter === level
                    ? "bg-th-accent-soft text-th-text-accent"
                    : "text-th-text-muted hover:bg-th-card-hover"
                }`}
              >
                {level.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowTimestamps(!showTimestamps)}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              showTimestamps
                ? "border-th-accent bg-th-accent-soft text-th-text-accent"
                : "border-th-border text-th-text-muted hover:bg-th-card-hover"
            }`}
          >
            Time
          </button>
          <button
            onClick={clearLogs}
            className="rounded-lg border border-th-border px-2.5 py-1.5 text-[11px] font-medium text-th-text-muted hover:bg-th-card-hover hover:text-th-danger transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* ── Log list ── */}
      <div className="max-h-[65vh] space-y-1 overflow-y-auto rounded-xl border border-th-border bg-th-card p-2">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-th-text-muted">
            No {filter === "all" ? "" : filter} events to show.
          </div>
        ) : (
          filteredLogs.map((entry) => {
            const s = LEVEL_STYLES[entry.level];
            const date = new Date(entry.timestamp);
            const timeStr = date.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const dateStr = date.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });

            const isExpanded = expandedLog === entry.id;
            const hasDetails = !!entry.details;

            return (
              <div
                key={entry.id}
                className={`group rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-th-border ${s.bg} ${hasDetails ? "cursor-pointer" : ""}`}
                onClick={() => {
                  if (hasDetails) {
                    setExpandedLog(isExpanded ? null : entry.id);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-th-text-muted">
                      {s.label}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-th-text leading-snug">
                      {entry.message}
                    </p>
                    {entry.details && !isExpanded && (
                      <button
                        className="mt-0.5 text-[11px] text-th-text-accent hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedLog(entry.id);
                        }}
                      >
                        ▸ Show details ({entry.details.split("\n").length} lines)
                      </button>
                    )}
                    {isExpanded && entry.details && (
                      <div className="mt-2 rounded-md border border-th-border bg-th-card-alt p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-th-text-muted">
                            Detailed Log
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedLog(null);
                            }}
                            className="text-[11px] text-th-text-muted hover:text-th-text"
                          >
                            ✕
                          </button>
                        </div>
                        <pre className="whitespace-pre-wrap break-words text-xs text-th-text-secondary leading-relaxed font-mono">
                          {entry.details}
                        </pre>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {entry.totalRuns !== undefined && (
                      <span className="rounded-md bg-th-accent-soft px-2 py-0.5 text-[11px] font-medium text-th-text-accent">
                        {entry.totalRuns} run{entry.totalRuns !== 1 ? "s" : ""}
                      </span>
                    )}
                    {entry.driftAlerts !== undefined &&
                      entry.driftAlerts > 0 && (
                        <span className="rounded-md bg-th-danger-soft px-2 py-0.5 text-[11px] font-medium text-th-danger">
                          {entry.driftAlerts} drift
                        </span>
                      )}
                    {entry.errors !== undefined && entry.errors > 0 && (
                      <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-500">
                        {entry.errors} err
                      </span>
                    )}
                    {entry.elapsedSeconds !== undefined && (
                      <span className="rounded-md bg-th-card-alt px-2 py-0.5 text-[11px] font-medium text-th-text-muted">
                        {entry.elapsedSeconds}s
                      </span>
                    )}
                  </div>
                  {showTimestamps && (
                    <span
                      className="shrink-0 pt-0.5 text-[11px] tabular-nums text-th-text-muted/60"
                      title={entry.timestamp}
                    >
                      {dateStr} {timeStr}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between rounded-lg border border-th-border bg-th-card-alt px-4 py-2.5">
        <div className="flex items-center gap-4 text-xs text-th-text-muted">
          <span>
            <span className="font-medium text-th-text">{logs.length}</span>{" "}
            total
          </span>
          <span>
            <span className="font-medium text-th-text">
              {logs.filter((l) => l.level === "info").length}
            </span>{" "}
            info
          </span>
          <span>
            <span className="font-medium text-yellow-500">
              {logs.filter((l) => l.level === "warn").length}
            </span>{" "}
            warn
          </span>
          <span>
            <span className="font-medium text-th-danger">
              {logs.filter((l) => l.level === "error").length}
            </span>{" "}
            error
          </span>
          <span className="flex items-center gap-1.5 text-th-text-muted/60">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-th-success animate-pulse" />
            live
          </span>
        </div>
        <span className="text-[11px] text-th-text-muted/50">
          persistent · auto-refreshes every 5s
        </span>
      </div>
    </div>
  );
}
