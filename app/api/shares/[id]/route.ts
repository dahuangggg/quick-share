import { env } from "cloudflare:workers";
import { findShare } from "../../../../db/shares";
import { formatShareId, parseShareId, type ShareBindings } from "../../../../lib/shares";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = parseShareId(rawId);
  if (!id) return Response.json({ error: "这个编号不存在。" }, { status: 404 });

  try {
    const bindings = env as unknown as ShareBindings;
    const share = await findShare(bindings.DB, id);
    if (!share) return Response.json({ error: "这个编号不存在。" }, { status: 404 });
    if (share.expiresAt <= Math.floor(Date.now() / 1000)) {
      return Response.json({ error: "这个分享已经过期。" }, { status: 410 });
    }

    return Response.json({
      id: share.id,
      displayId: formatShareId(share.id),
      kind: share.kind,
      name: share.originalName,
      contentType: share.contentType,
      size: share.size,
      noteText: share.noteText,
      createdAt: new Date(share.createdAt * 1000).toISOString(),
      expiresAt: new Date(share.expiresAt * 1000).toISOString(),
    }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    console.error("share lookup failed", error);
    return Response.json({ error: "暂时无法读取这个分享。" }, { status: 500 });
  }
}
