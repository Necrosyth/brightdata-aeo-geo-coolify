/**
 * Neon-based cloud storage configuration check.
 * Returns true if DATABASE_URL is set (indicating Neon PostgreSQL is available).
 */
export function isCloudStorageConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
