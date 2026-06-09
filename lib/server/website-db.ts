/**
 * Database operations for website data
 * Using Neon PostgreSQL
 */
import { queryOne, queryAll, query } from "./neon";

export interface WebsiteDataRecord {
  id: string;
  sourceUrl: string;
  sectionName: string;
  title: string | null;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastScrapedAt: string | null;
}

/**
 * Store or update website data
 */
export async function upsertWebsiteData(
  sourceUrl: string,
  sectionName: string,
  title: string | null,
  content: string,
  metadata: Record<string, unknown> = {},
): Promise<WebsiteDataRecord> {
  const now = new Date().toISOString();

  const result = await queryOne<any>(
    `INSERT INTO public.website_data
      (source_url, section_name, title, content, metadata, last_scraped_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (source_url, section_name)
    DO UPDATE SET
      title = $3,
      content = $4,
      metadata = $5,
      last_scraped_at = $6,
      updated_at = NOW()
    RETURNING *`,
    [sourceUrl, sectionName, title, content, JSON.stringify(metadata), now],
  );

  if (!result) {
    throw new Error("Failed to upsert website data");
  }

  return mapDatabaseRecord(result);
}

/**
 * Retrieve website data
 */
export async function getWebsiteData(
  sourceUrl?: string,
  sectionName?: string,
): Promise<WebsiteDataRecord[]> {
  let sql = "SELECT * FROM public.website_data";
  const values: any[] = [];
  const conditions: string[] = [];

  if (sourceUrl) {
    conditions.push(`source_url = $${values.length + 1}`);
    values.push(sourceUrl);
  }

  if (sectionName) {
    conditions.push(`section_name = $${values.length + 1}`);
    values.push(sectionName);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY section_name ASC";

  const results = await queryAll<any>(sql, values);
  return results.map(mapDatabaseRecord);
}

/**
 * Update website data content
 */
export async function updateWebsiteDataContent(
  id: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<WebsiteDataRecord> {
  const updateData = { content };
  const values: any[] = [content, id];
  const setClause = ["content = $1"];

  if (metadata) {
    setClause.push(`metadata = $${values.length + 1}`);
    values.push(JSON.stringify(metadata));
  }

  const result = await queryOne<any>(
    `UPDATE public.website_data
     SET ${setClause.join(", ")}, updated_at = NOW()
     WHERE id = $${values.length + 1}
     RETURNING *`,
    [...values, id],
  );

  if (!result) {
    throw new Error("Failed to update website data");
  }

  return mapDatabaseRecord(result);
}

/**
 * Delete website data
 */
export async function deleteWebsiteData(id: string): Promise<void> {
  const result = await query("DELETE FROM public.website_data WHERE id = $1", [
    id,
  ]);

  if (result.rowCount === 0) {
    throw new Error("Record not found");
  }
}

/**
 * Map database record to interface
 */
function mapDatabaseRecord(record: any): WebsiteDataRecord {
  return {
    id: record.id,
    sourceUrl: record.source_url,
    sectionName: record.section_name,
    title: record.title,
    content: record.content,
    metadata:
      typeof record.metadata === "string"
        ? JSON.parse(record.metadata)
        : record.metadata || {},
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    lastScrapedAt: record.last_scraped_at,
  };
}
