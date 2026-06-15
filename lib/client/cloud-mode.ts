"use client";

/**
 * Cloud storage mode detection.
 *
 * On startup, the app probes `/api/state` to check if the server has a
 * database configured. If it does, all data goes to Neon directly.
 * No local storage, no IndexedDB.
 */

// Cached result of the server probe — null = not yet checked
let _probed: boolean | null = null;

/**
 * Probe the server to check if cloud storage is actually configured.
 * Call this once on app startup. Stores the result in a module-level cache.
 *
 * Uses a generous timeout (15s) to accommodate Neon cold-starts where
 * the first database query can take several seconds.
 */
export async function probeCloudAvailability(): Promise<boolean> {
  try {
    // 15s timeout — Neon cold-starts can be slow on the first query
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch("/api/state?key=__probe__", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // 501 means DATABASE_URL not set — cloud unavailable
    // Any other response (200, 400, etc.) means the server has a DB
    _probed = res.status !== 501;
  } catch {
    // Network error or timeout — assume cloud is unavailable for now
    _probed = false;
  }
  return _probed;
}

/**
 * Retry the probe up to `retries` times with a delay between attempts.
 * Returns the probe result.
 */
export async function probeWithRetry(
  retries = 3,
  delayMs = 3000,
): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const result = await probeCloudAvailability();
    if (result) return true;
    if (attempt < retries - 1) {
      console.log(
        `[cloud-mode] Probe attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

export function isCloudAvailable(): boolean {
  // If we haven't probed yet, optimistically assume true.
  // The probe runs on startup and will update this.
  return _probed !== false;
}

/** True when cloud storage is available (no user toggle — always on when available). */
export function isCloudActive(): boolean {
  return isCloudAvailable();
}
