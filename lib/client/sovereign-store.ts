"use client";

import { isCloudActive } from "./cloud-mode";

/**
 * Storage abstraction for the geo-aeo-tracker app.
 *
 * Neon-only mode: all data is read/written directly to the PostgreSQL
 * kv_store table via /api/state. No IndexedDB, no localStorage.
 */

async function cloudGet<T>(key: string): Promise<T | null> {
  const res = await fetch(`/api/state?key=${encodeURIComponent(key)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`cloud GET failed: ${res.status}`);
  const data = (await res.json()) as { value: T | null };
  return data.value;
}

async function cloudPut<T>(key: string, value: T): Promise<void> {
  const res = await fetch(`/api/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error(`cloud PUT failed: ${res.status}`);
}

async function cloudDelete(key: string): Promise<void> {
  const res = await fetch(`/api/state?key=${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`cloud DELETE failed: ${res.status}`);
  }
}

/**
 * Load state directly from Neon. Returns the fallback value when:
 * - The key doesn't exist in the DB
 * - The server is unavailable (network error / cold-start)
 */
export async function loadSovereignValue<T>(
  key: string,
  fallback: T,
): Promise<T> {
  if (!isCloudActive()) return fallback;

  try {
    const cloudValue = await cloudGet<T>(key);
    return cloudValue !== null && cloudValue !== undefined
      ? cloudValue
      : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Save state directly to Neon.
 */
export async function saveSovereignValue<T>(
  key: string,
  value: T,
): Promise<void> {
  if (!isCloudActive()) return;

  await cloudPut(key, value);
}

/**
 * Delete a key from Neon.
 */
export async function clearSovereignStore(key: string): Promise<void> {
  if (!isCloudActive()) return;

  try {
    await cloudDelete(key);
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[sovereign-store] cloud delete failed:", err);
    }
  }
}
