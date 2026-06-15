"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────

type DbStatus = {
  ok: boolean;
  version?: string;
  error?: string;
};

type MigrationRecord = {
  id: number;
  name: string;
  applied_at: string;
  checksum: string;
  duration_ms: number;
};

type MigrationResult = {
  name: string;
  status: "applied" | "skipped" | "error";
  duration_ms: number;
  error?: string;
};

type MigrationStatus = {
  db: DbStatus;
  applied: MigrationRecord[];
  pending: string[];
  registered: string[];
};

// ── Styles ─────────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  applied: { bg: "bg-th-success-soft/40", text: "text-th-success", label: "Applied" },
  skipped: { bg: "bg-th-border/60", text: "text-th-text-muted", label: "Skipped" },
  error: { bg: "bg-th-danger-soft/40", text: "text-th-danger", label: "Error" },
  pending: { bg: "bg-yellow-500/10", text: "text-yellow-500", label: "Pending" },
};

// ── Component ──────────────────────────────────────────────────────

export function MigrationsTab() {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MigrationResult[] | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/migrations", { cache: "no-store" });

      if (res.status === 501) {
        setStatus(null);
        setError("Database is not configured.");
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleRunPending = async () => {
    try {
      setRunning(true);
      setResults(null);
      setError(null);
      const res = await fetch("/api/migrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setResultOpen(true);
      // Refresh status
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run migrations");
    } finally {
      setRunning(false);
    }
  };

  const handleRunSingle = async (name: string) => {
    try {
      setRunning(true);
      setResults(null);
      setError(null);
      const res = await fetch("/api/migrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setResultOpen(true);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run migration");
    } finally {
      setRunning(false);
    }
  };

  const handleRevert = async (name: string) => {
    if (!confirm(`Revert migration "${name}"? This will run its down() function.`)) return;

    try {
      setRunning(true);
      setResults(null);
      setError(null);
      const res = await fetch("/api/migrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, action: "revert" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setResultOpen(true);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revert migration");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-th-text">Database Migrations</h2>
          <p className="text-xs text-th-text-muted mt-0.5">
            Manage schema migrations directly from the app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-th-border bg-th-card text-th-text hover:bg-th-border/40 transition-colors disabled:opacity-40"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          {status && status.pending.length > 0 && (
            <button
              onClick={handleRunPending}
              disabled={running}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-th-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {running ? "Running..." : "Run Pending"}
            </button>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg bg-th-danger-soft/20 border border-th-danger/30 px-4 py-3 text-sm text-th-danger">
          {error}
        </div>
      )}

      {/* ── DB Status ── */}
      {status && (
        <div className="rounded-xl border border-th-border bg-th-card p-4">
          <h3 className="text-sm font-semibold text-th-text mb-3">Database Connection</h3>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                status.db.ok ? "bg-th-success" : "bg-th-danger"
              }`}
            />
            <span className="text-xs font-medium text-th-text">
              {status.db.ok ? "Connected" : "Disconnected"}
            </span>
            {status.db.version && (
              <span className="text-xs text-th-text-muted ml-2">
                {status.db.version}
              </span>
            )}
          </div>
          {!status.db.ok && status.db.error && (
            <p className="text-xs text-th-danger mt-1">{status.db.error}</p>
          )}
        </div>
      )}

      {/* ── Results Panel ── */}
      {resultOpen && results && results.length > 0 && (
        <div className="rounded-xl border border-th-border bg-th-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-th-text">Migration Results</h3>
            <button
              onClick={() => setResultOpen(false)}
              className="text-xs text-th-text-muted hover:text-th-text transition-colors"
            >
              Dismiss
            </button>
          </div>
          <div className="space-y-2">
            {results.map((r) => {
              const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.error;
              return (
                <div
                  key={r.name}
                  className="flex items-center justify-between rounded-lg bg-th-surface/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${badge.bg}`}
                    />
                    <span className="text-xs font-medium text-th-text">
                      {r.name}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-th-text-muted">
                      {r.duration_ms}ms
                    </span>
                    {r.error && (
                      <span className="text-[10px] text-th-danger max-w-[200px] truncate" title={r.error}>
                        {r.error}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && !status && (
        <div className="text-center py-8 text-xs text-th-text-muted">
          Checking migration status...
        </div>
      )}

      {/* ── Migrations List ── */}
      {status && !loading && (
        <div className="rounded-xl border border-th-border bg-th-card overflow-hidden">
          <div className="p-4 border-b border-th-border">
            <h3 className="text-sm font-semibold text-th-text">
              Migrations
              <span className="ml-2 text-[10px] font-normal text-th-text-muted">
                {status.registered.length} registered
                {status.pending.length > 0 && (
                  <span className="ml-1 text-yellow-500">
                    &middot; {status.pending.length} pending
                  </span>
                )}
              </span>
            </h3>
          </div>

          {status.registered.length === 0 ? (
            <div className="p-6 text-center text-xs text-th-text-muted">
              No migrations registered.
            </div>
          ) : (
            <div className="divide-y divide-th-border">
              {status.registered.map((name) => {
                const record = status.applied.find((a) => a.name === name);
                const isPending = !record;
                const badge = isPending
                  ? STATUS_BADGE.pending
                  : STATUS_BADGE.applied;

                return (
                  <div
                    key={name}
                    className="flex items-center justify-between px-4 py-3 hover:bg-th-surface/20 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${badge.bg}`}
                      />
                      <div>
                        <span className="text-xs font-medium text-th-text">
                          {name}
                        </span>
                        {record && (
                          <span className="ml-2 text-[10px] text-th-text-muted">
                            {new Date(record.applied_at).toLocaleString()} &middot;{" "}
                            {record.duration_ms}ms
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isPending ? (
                        <button
                          onClick={() => handleRunSingle(name)}
                          disabled={running}
                          className="px-2 py-1 text-[10px] font-medium rounded-md bg-th-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                        >
                          Apply
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRevert(name)}
                          disabled={running}
                          className="px-2 py-1 text-[10px] font-medium rounded-md border border-th-danger/40 text-th-danger hover:bg-th-danger-soft/20 transition-colors disabled:opacity-40"
                        >
                          Revert
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Info ── */}
      <div className="rounded-xl border border-th-border bg-th-card p-4">
        <h3 className="text-sm font-semibold text-th-text mb-2">How It Works</h3>
        <ul className="space-y-1 text-xs text-th-text-muted">
          <li>&bull; Migrations are registered in <code className="text-th-text bg-th-surface/40 px-1 rounded">lib/server/migrations/index.ts</code></li>
          <li>&bull; New migrations auto-run on server start via the instrumentation hook</li>
          <li>&bull; Already-applied migrations are skipped (tracked in <code className="text-th-text bg-th-surface/40 px-1 rounded">migrations_meta</code> table)</li>
          <li>&bull; Use the buttons above to manually apply or revert individual migrations</li>
          <li>&bull; To add a migration, create a file like <code className="text-th-text bg-th-surface/40 px-1 rounded">002-my-feature.ts</code> and register it in the index</li>
        </ul>
      </div>
    </div>
  );
}
