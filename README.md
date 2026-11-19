# Quick Share

[中文](#中文) | [English](#english)

---

## 中文

一个轻量、临时的文件与文本分享平台，运行在 Cloudflare Workers 上，接收者只需一个简短的数字取件码。

### 状态

早期项目，不再维护。

### 功能

- 拖拽文件、粘贴截图或粘贴文字，也可以给文件附带一段文字
- `12h / 24h / 3d / 7d` 有效期
- 简短连续编号同时作为 URL 和取件码，例如 `/001`
- 图片和文本在线预览，其他文件直接下载
- 到期立即停止访问，并由 Worker 清理 D1 和 R2 内容（定时 handler + 每 15 分钟机会性清理）
- 单文件限制 50 MB
- 共享上传口令；接收和下载无需登录
- 同一 IP 每小时最多尝试上传 20 次

### 技术栈

- TypeScript、React 19、Tailwind CSS v4
- Vinext（基于 Vite 的 Next.js 风格框架）
- Cloudflare Workers：页面、上传与下载接口
- Cloudflare D1 + Drizzle ORM：分享元数据、连续编号与上传限流
- Cloudflare R2：文件、图片和文本内容

### 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm install
cp .env.example .env.local
# 在 .env.local 中设置 UPLOAD_PASSWORD
npm run dev
```

本地开发时由 Cloudflare Vite 插件模拟 D1 与 R2。

验证：

```bash
npm test
npm run test:upload-security   # 需先启动 dev server
npm run lint
```

修改 `db/schema.ts` 后重新生成迁移：`npm run db:generate`。

### 部署到个人 Cloudflare 账户

先启用 Workers、D1 和 R2，然后创建资源并复制示例配置（填写自己的 D1 UUID、Worker 名称和域名）：

```bash
npx wrangler login
npx wrangler d1 create quick-share-db
npx wrangler r2 bucket create quick-share-files
cp wrangler.direct.example.jsonc wrangler.direct.jsonc
```

`wrangler.direct.jsonc` 是本机私有配置（已被 Git 忽略），声明 `DB`（D1）、`SHARE_FILES`（R2）、`ASSETS`（静态文件）绑定。然后迁移、部署并设置上传口令：

```bash
npm run db:migrate:remote
npm run deploy
npx wrangler secret put UPLOAD_PASSWORD -c dist/server/wrangler.json
```

生产环境口令作为 Cloudflare Worker secret 保存，不写入源码或配置。

### 目录结构

```text
app/              页面与组件（首页、/[id] 分享页）
app/api/shares/   上传、元数据与内容下载接口
db/               Drizzle schema 与 D1 数据访问
drizzle/          数据库迁移
lib/              共享常量与工具（大小、有效期限制等）
worker/           Worker 入口与过期清理
scripts/          部署配置合并脚本
tests/            渲染测试与 e2e 脚本
public/           静态资源
```

---

## English

A lightweight, temporary file and text sharing platform running on Cloudflare Workers. Recipients only need a short numeric pickup code.

### Status

Early project, no longer actively maintained.

### Features

- Drag-and-drop files, paste screenshots or text, or attach a note to a file
- Retention of `12h / 24h / 3d / 7d`
- Short sequential IDs serve as both URL and pickup code, e.g. `/001`
- Inline preview for images and text; other files are downloaded
- Expired shares become inaccessible immediately; the Worker purges D1 and R2 content (scheduled handler + opportunistic cleanup every 15 minutes)
- 50 MB per-file limit
- Shared upload password; receiving and downloading need no login
- At most 20 upload attempts per IP per hour

### Tech Stack

- TypeScript, React 19, Tailwind CSS v4
- Vinext (Vite-based Next.js-style framework)
- Cloudflare Workers: pages, upload and download APIs
- Cloudflare D1 + Drizzle ORM: share metadata, sequential IDs, upload rate limits
- Cloudflare R2: file, image and text content

### Getting Started

Requires Node.js `>=22.13.0`.

```bash
npm install
cp .env.example .env.local
# set UPLOAD_PASSWORD in .env.local
npm run dev
```

In local development the Cloudflare Vite plugin emulates D1 and R2.

Checks:

```bash
npm test
npm run test:upload-security   # requires the dev server running
npm run lint
```

After changing `db/schema.ts`, regenerate migrations with `npm run db:generate`.

### Deploy to Your Own Cloudflare Account

Enable Workers, D1 and R2, create the resources, and copy the example config (fill in your D1 UUID, Worker name and domain):

```bash
npx wrangler login
npx wrangler d1 create quick-share-db
npx wrangler r2 bucket create quick-share-files
cp wrangler.direct.example.jsonc wrangler.direct.jsonc
```

`wrangler.direct.jsonc` is a private local config (git-ignored) declaring the `DB` (D1), `SHARE_FILES` (R2) and `ASSETS` (static files) bindings. Then migrate, deploy and set the upload password:

```bash
npm run db:migrate:remote
npm run deploy
npx wrangler secret put UPLOAD_PASSWORD -c dist/server/wrangler.json
```

The production password is stored as a Cloudflare Worker secret, never in source or config.

### Directory Structure

```text
app/              Pages and components (home, /[id] share view)
app/api/shares/   Upload, metadata and content download APIs
db/               Drizzle schema and D1 data access
drizzle/          Database migrations
lib/              Shared constants and helpers (size/retention limits)
worker/           Worker entrypoint and expiry cleanup
scripts/          Deploy config merge script
tests/            Rendered-HTML test and e2e scripts
public/           Static assets
```
