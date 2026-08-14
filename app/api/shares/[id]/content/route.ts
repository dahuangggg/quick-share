import { env } from "cloudflare:workers";
import { findShare } from "../../../../../db/shares";
import { contentDisposition, parseShareId, type ShareBindings } from "../../../../../lib/shares";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = parseShareId(rawId);
  if (!id) return new Response("Not found", { status: 404 });

  try {
    const bindings = env as unknown as ShareBindings;
    const share = await findShare(bindings.DB, id);
    if (!share) return new Response("Not found", { status: 404 });
    if (share.expiresAt <= Math.floor(Date.now() / 1000)) {
      return new Response("Gone", { status: 410 });
    }

    const rangeHeader = request.headers.get("range");
    const object = rangeHeader
      ? await bindings.SHARE_FILES.get(share.r2Key, { range: new Headers({ range: rangeHeader }) })
      : await bindings.SHARE_FILES.get(share.r2Key);
    if (!object || !("body" in object)) return new Response("Not found", { status: 404 });

    const download = new URL(request.url).searchParams.get("download") === "1";
    const inline = !download && (share.kind === "text" || share.kind === "image");
    const headers = new Headers({
      "content-type": share.contentType,
      "content-disposition": contentDisposition(share.originalName, inline),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      etag: object.httpEtag,
    });

    if (rangeHeader && object.range) {
      const range = object.range as { offset: number; length: number };
      headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
      headers.set("content-length", String(range.length));
      headers.set("accept-ranges", "bytes");
      return new Response(object.body, { status: 206, headers });
    }

    headers.set("content-length", String(object.size));
    return new Response(object.body, { headers });
  } catch (error) {
    console.error("share content failed", error);
    return new Response("Unable to load share", { status: 500 });
  }
}
