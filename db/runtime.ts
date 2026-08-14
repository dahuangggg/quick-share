const initialization = new WeakMap<object, Promise<void>>();

export function ensureShareSchema(database: D1Database): Promise<void> {
  const existing = initialization.get(database);
  if (existing) return existing;

  const task = (async () => {
    await database.prepare(`
      CREATE TABLE IF NOT EXISTS shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        r2_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        original_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        note_text TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `).run();

    await database.prepare(`
      CREATE TABLE IF NOT EXISTS upload_rate_limits (
        client_hash TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        attempt_count INTEGER NOT NULL
      )
    `).run();

    const columns = await database.prepare("PRAGMA table_info(shares)").all<{ name: string }>();
    if (!columns.results.some((column) => column.name === "note_text")) {
      await database.prepare("ALTER TABLE shares ADD COLUMN note_text TEXT").run();
    }

    await database.batch([
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_r2_key ON shares (r2_key)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares (expires_at)"),
    ]);
  })();

  initialization.set(database, task);
  return task;
}
