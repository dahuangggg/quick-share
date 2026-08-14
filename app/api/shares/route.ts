import { env } from "cloudflare:workers";
import { createShare } from "../../../db/shares";
import { consumeUploadAttempt } from "../../../db/upload-rate-limits";
import {
  ALLOWED_TTLS,
  classifyContentType,
  formatShareId,
  MAX_TEXT_BYTES,
  MAX_UPLOAD_BYTES,
  safeShareName,
  type ShareBindings,
} from "../../../lib/shares";

type UploadPayload = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  kind: "text" | "image" | "file";
  originalName: string;
  noteText: string | null;
};

export async function POST(request: Request) {
  const bindings = env as unknown as ShareBindings;
  if (!bindings.UPLOAD_PASSWORD) {
    console.error("UPLOAD_PASSWORD is not configured");
    return Response.json({ error: "上传功能暂未配置，请联系站点主人。" }, { status: 503 });
  }

  const now = Math.floor(Date.now() / 1000);
  const clientHash = await hashClientIdentifier(clientIdentifier(request));
  const rateLimit = await consumeUploadAttempt(bindings.DB, clientHash, now);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "这一小时尝试次数太多，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const suppliedPassword = decodePasswordHeader(request.headers.get("x-upload-password"));
  if (!(await passwordsMatch(suppliedPassword, bindings.UPLOAD_PASSWORD))) {
    return Response.json({ error: "上传口令不正确。" }, { status: 401 });
  }

  const url = new URL(request.url);
  const ttl = Number.parseInt(url.searchParams.get("ttl") ?? "", 10);
  if (!ALLOWED_TTLS.has(ttl)) {
    return Response.json({ error: "请选择有效的保留时间。" }, { status: 400 });
  }

  const declaredSize = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (declaredSize > MAX_UPLOAD_BYTES + MAX_TEXT_BYTES + 2 * 1024 * 1024) {
    return Response.json({ error: "文件或附带文字超过大小限制。" }, { status: 413 });
  }

  let payload: UploadPayload;
  try {
    payload = await readUploadPayload(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "没有收到要分享的内容。";
    return Response.json({ error: message }, { status: message.includes("MB") ? 413 : 400 });
  }

  const r2Key = `shares/${crypto.randomUUID()}`;
  const createdAt = Math.floor(Date.now() / 1000);

  try {
    const object = await bindings.SHARE_FILES.put(r2Key, payload.body, {
      httpMetadata: {
        contentType: payload.contentType,
        contentDisposition: contentDispositionForStorage(payload.originalName),
        cacheControl: "private, no-store",
      },
      customMetadata: {
        expiresAt: String(createdAt + ttl),
      },
    });

    if (!object) throw new Error("R2 upload returned no object");
    if (object.size > MAX_UPLOAD_BYTES) {
      await bindings.SHARE_FILES.delete(r2Key);
      return Response.json({ error: "单个文件不能超过 50 MB。" }, { status: 413 });
    }

    try {
      const share = await createShare(bindings.DB, {
        r2Key,
        kind: payload.kind,
        originalName: payload.originalName,
        contentType: payload.contentType,
        size: object.size,
        noteText: payload.noteText,
        createdAt,
        expiresAt: createdAt + ttl,
      });

      const displayId = formatShareId(share.id);
      return Response.json({
        id: share.id,
        displayId,
        url: `/${displayId}`,
        expiresAt: new Date(share.expiresAt * 1000).toISOString(),
      }, { status: 201 });
    } catch (databaseError) {
      await bindings.SHARE_FILES.delete(r2Key);
      throw databaseError;
    }
  } catch (error) {
    console.error("share upload failed", error);
    return Response.json({ error: "上传没有完成，请稍后再试。" }, { status: 500 });
  }
}

function clientIdentifier(request: Request): string {
  const hostname = new URL(request.url).hostname;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return forwarded || request.headers.get("cf-connecting-ip") || "unknown";
  }
  return request.headers.get("cf-connecting-ip") || "unknown";
}

async function hashClientIdentifier(identifier: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identifier));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodePasswordHeader(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

async function passwordsMatch(supplied: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const suppliedBytes = new Uint8Array(suppliedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= suppliedBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

async function readUploadPayload(request: Request): Promise<UploadPayload> {
  const requestContentType = request.headers.get("content-type") || "";
  if (!requestContentType.startsWith("multipart/form-data")) {
    if (!request.body) throw new Error("没有收到要分享的内容。");
    const contentType = requestContentType.slice(0, 180) || "application/octet-stream";
    const kind = classifyContentType(contentType);
    return {
      body: request.body,
      contentType,
      kind,
      originalName: safeShareName(request.headers.get("x-share-name"), kind),
      noteText: null,
    };
  }

  const formData = await request.formData();
  const filePart = formData.get("file");
  const rawText = formData.get("text");
  const note = typeof rawText === "string" ? rawText.trim() : "";
  if (new TextEncoder().encode(note).byteLength > MAX_TEXT_BYTES) {
    throw new Error("附带文字不能超过 1 MB。");
  }

  if (filePart instanceof File && filePart.size > 0) {
    if (filePart.size > MAX_UPLOAD_BYTES) throw new Error("单个文件不能超过 50 MB。");
    const contentType = (filePart.type || "application/octet-stream").slice(0, 180);
    const kind = contentType.startsWith("image/") ? "image" : "file";
    return {
      body: filePart.stream(),
      contentType,
      kind,
      originalName: safeShareName(encodeURIComponent(filePart.name), kind),
      noteText: note || null,
    };
  }

  if (!note) throw new Error("没有收到要分享的内容。");
  const textBlob = new Blob([note], { type: "text/plain;charset=utf-8" });
  return {
    body: textBlob.stream(),
    contentType: textBlob.type,
    kind: "text",
    originalName: "分享文本.txt",
    noteText: null,
  };
}

function contentDispositionForStorage(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "download";
  return `inline; filename="${ascii}"`;
}
