import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const shares = sqliteTable(
  "shares",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    r2Key: text("r2_key").notNull(),
    kind: text("kind", { enum: ["text", "image", "file"] }).notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    noteText: text("note_text"),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_shares_r2_key").on(table.r2Key),
    index("idx_shares_expires_at").on(table.expiresAt),
  ],
);

export const uploadRateLimits = sqliteTable("upload_rate_limits", {
  clientHash: text("client_hash").primaryKey(),
  windowStart: integer("window_start").notNull(),
  attemptCount: integer("attempt_count").notNull(),
});

export type ShareKind = "text" | "image" | "file";
