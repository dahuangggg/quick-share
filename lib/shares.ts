import type { ShareKind } from "../db/schema";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1024 * 1024;
export const ALLOWED_TTLS = new Set([43_200, 86_400, 259_200, 604_800]);

export type ShareBindings = {
  DB: D1Database;
  SHARE_FILES: R2Bucket;
  UPLOAD_PASSWORD?: string;
};

export function formatShareId(id: number): string {
  return String(id).padStart(3, "0");
}

export function parseShareId(value: string): number | null {
  if (!/^\d{1,12}$/.test(value)) return null;
  const id = Number.parseInt(value, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function classifyContentType(contentType: string): ShareKind {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("text/")) return "text";
  return "file";
}

export function safeShareName(headerValue: string | null, kind: ShareKind): string {
  const fallback = kind === "text" ? "分享文本.txt" : kind === "image" ? "图片" : "文件";
  if (!headerValue) return fallback;

  try {
    const decoded = decodeURIComponent(headerValue);
    const sanitized = Array.from(decoded).filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127 && character !== "/" && character !== "\\";
    }).join("").trim();
    return sanitized.slice(0, 180) || fallback;
  } catch {
    return fallback;
  }
}

export function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "download";
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
