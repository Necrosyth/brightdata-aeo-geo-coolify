/**
 * Next.js Instrumentation Hook
 *
 * Runs on server startup. This is where we auto-apply pending database
 * migrations before the app starts serving requests.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server, not during static generation
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (!process.env.DATABASE_URL) {
    console.log("[startup] No database configured — skipping migrations");
    return;
  }

  try {
    // Dynamic import so the migration module only loads when DB is configured
    const { runPendingMigrations } =
      await import("@/lib/server/migrations/migration-engine");
    await import("@/lib/server/migrations/index");

    console.log("[startup] Running pending database migrations...");
    const results = await runPendingMigrations();

    const applied = results.filter((r) => r.status === "applied");
    const errors = results.filter((r) => r.status === "error");

    if (applied.length > 0) {
      console.log(
        `[startup] Applied ${applied.length} migration(s):`,
        applied.map((r) => `${r.name} (${r.duration_ms}ms)`).join(", "),
      );
    }

    if (errors.length > 0) {
      console.error(
        `[startup] ${errors.length} migration(s) failed:`,
        errors.map((r) => `${r.name}: ${r.error}`).join(", "),
      );
    }

    if (applied.length === 0 && errors.length === 0) {
      console.log("[startup] All migrations already applied — nothing to do");
    }
  } catch (error) {
    console.error("[startup] Migration auto-run failed:", error);
  }
}
