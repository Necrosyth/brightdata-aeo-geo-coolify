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
 */
export async function probeCloudAvailability(): Promise<boolean> {
  try {
    // Timeout after 3s so this doesn't block rendering
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
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
    // Network error or timeout — assume cloud is unavailable
    _probed = false;
  }
  return _probed;
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
