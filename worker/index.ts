/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { deleteShares, listExpiredShares } from "../db/shares";
import { deleteExpiredUploadRateLimits } from "../db/upload-rate-limits";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SHARE_FILES: R2Bucket;
  UPLOAD_PASSWORD?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

let lastOpportunisticCleanup = 0;

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const now = Date.now();
    if (env.DB && env.SHARE_FILES && now - lastOpportunisticCleanup >= 15 * 60 * 1000) {
      lastOpportunisticCleanup = now;
      ctx.waitUntil(cleanExpiredShares(env));
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanExpiredShares(env));
  },
};

async function cleanExpiredShares(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await deleteExpiredUploadRateLimits(env.DB, now);

  for (let page = 0; page < 10; page += 1) {
    const expired = await listExpiredShares(env.DB, now, 100);
    if (expired.length === 0) return;

    await env.SHARE_FILES.delete(expired.map((share) => share.r2Key));
    await deleteShares(env.DB, expired.map((share) => share.id));
    if (expired.length < 100) return;
  }
}

export default worker;
