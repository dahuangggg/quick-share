import type { ShareKind } from "./schema";
import { ensureShareSchema } from "./runtime";

export type ShareRecord = {
  id: number;
  r2Key: string;
  kind: ShareKind;
  originalName: string;
  contentType: string;
  size: number;
  noteText: string | null;
  createdAt: number;
  expiresAt: number;
};

type ShareRow = {
  id: number;
  r2_key: string;
  kind: ShareKind;
  original_name: string;
  content_type: string;
  size: number;
  note_text: string | null;
  created_at: number;
  expires_at: number;
};

function mapShare(row: ShareRow): ShareRecord {
  return {
    id: row.id,
    r2Key: row.r2_key,
    kind: row.kind,
    originalName: row.original_name,
    contentType: row.content_type,
    size: row.size,
    noteText: row.note_text,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function createShare(
  database: D1Database,
  input: Omit<ShareRecord, "id">,
): Promise<ShareRecord> {
  await ensureShareSchema(database);
  const row = await database.prepare(`
    INSERT INTO shares (
      r2_key, kind, original_name, content_type, size, note_text, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id, r2_key, kind, original_name, content_type, size, note_text, created_at, expires_at
  `).bind(
    input.r2Key,
    input.kind,
    input.originalName,
    input.contentType,
    input.size,
    input.noteText,
    input.createdAt,
    input.expiresAt,
  ).first<ShareRow>();

  if (!row) throw new Error("D1 did not return the created share");
  return mapShare(row);
}

export async function findShare(database: D1Database, id: number): Promise<ShareRecord | null> {
  await ensureShareSchema(database);
  const row = await database.prepare(`
    SELECT id, r2_key, kind, original_name, content_type, size, note_text, created_at, expires_at
    FROM shares
    WHERE id = ?
  `).bind(id).first<ShareRow>();

  return row ? mapShare(row) : null;
}

export async function listExpiredShares(
  database: D1Database,
  now: number,
  limit = 100,
): Promise<ShareRecord[]> {
  await ensureShareSchema(database);
  const result = await database.prepare(`
    SELECT id, r2_key, kind, original_name, content_type, size, note_text, created_at, expires_at
    FROM shares
    WHERE expires_at <= ?
    ORDER BY expires_at ASC
    LIMIT ?
  `).bind(now, limit).all<ShareRow>();

  return result.results.map(mapShare);
}

export async function deleteShares(database: D1Database, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await database.batch(ids.map((id) => database.prepare("DELETE FROM shares WHERE id = ?").bind(id)));
}
