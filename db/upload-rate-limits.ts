import { ensureShareSchema } from "./runtime";

export const UPLOAD_ATTEMPT_LIMIT = 20;
export const UPLOAD_LIMIT_WINDOW_SECONDS = 60 * 60;

type UploadRateLimitRow = {
  attempt_count: number;
};

export type UploadRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export async function consumeUploadAttempt(
  database: D1Database,
  clientHash: string,
  now: number,
): Promise<UploadRateLimitResult> {
  await ensureShareSchema(database);
  const windowStart = Math.floor(now / UPLOAD_LIMIT_WINDOW_SECONDS) * UPLOAD_LIMIT_WINDOW_SECONDS;
  const row = await database.prepare(`
    INSERT INTO upload_rate_limits (client_hash, window_start, attempt_count)
    VALUES (?, ?, 1)
    ON CONFLICT(client_hash) DO UPDATE SET
      window_start = CASE
        WHEN upload_rate_limits.window_start != excluded.window_start THEN excluded.window_start
        ELSE upload_rate_limits.window_start
      END,
      attempt_count = CASE
        WHEN upload_rate_limits.window_start != excluded.window_start THEN 1
        ELSE upload_rate_limits.attempt_count + 1
      END
    RETURNING attempt_count
  `).bind(clientHash, windowStart).first<UploadRateLimitRow>();

  if (!row) throw new Error("D1 did not return the upload rate limit");
  return {
    allowed: row.attempt_count <= UPLOAD_ATTEMPT_LIMIT,
    retryAfterSeconds: Math.max(1, windowStart + UPLOAD_LIMIT_WINDOW_SECONDS - now),
  };
}

export async function deleteExpiredUploadRateLimits(
  database: D1Database,
  now: number,
): Promise<void> {
  await ensureShareSchema(database);
  const oldestActiveWindow =
    Math.floor(now / UPLOAD_LIMIT_WINDOW_SECONDS) * UPLOAD_LIMIT_WINDOW_SECONDS;
  await database.prepare(
    "DELETE FROM upload_rate_limits WHERE window_start < ?",
  ).bind(oldestActiveWindow).run();
}
