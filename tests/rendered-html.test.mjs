import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished sharing home page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>快传｜告诉朋友一个编号<\/title>/);
  assert.match(html, /放上来/);
  assert.match(html, /生成分享编号/);
  assert.match(html, /上传口令/);
  assert.match(html, /接收内容不需要口令/);
  assert.match(html, /输入编号接收/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("declares personal Cloudflare D1 and R2 bindings", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.direct.example.jsonc", import.meta.url), "utf8"));
  assert.equal(config.d1_databases[0].binding, "DB");
  assert.equal(config.r2_buckets[0].binding, "SHARE_FILES");
  assert.equal(config.assets.binding, "ASSETS");
});

test("preserves Vinext server modules in the prepared Worker deployment", async () => {
  const config = JSON.parse(await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"));
  assert.equal(config.main, "index.js");
  assert.equal(config.name, "quick-share");
  assert.equal(config.assets.directory, "../client");
  assert.equal(config.assets.binding, "ASSETS");
  assert.ok(
    config.rules.some((rule) => rule.type === "ESModule" && rule.globs.includes("**/*.js")),
    "Vinext server modules must be uploaded alongside index.js",
  );
  assert.equal(config.routes[0].pattern, "share.example.com");
  assert.equal(config.routes[0].custom_domain, true);
});
