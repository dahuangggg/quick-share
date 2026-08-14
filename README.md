# Quick Share

一个轻量、临时的文件与文本分享平台，运行在 Cloudflare Workers 上。上传者可以分享文件、图片、文本或“文件 + 附带文字”，接收者只需要一个简短的数字编号。

## 功能

- 拖拽文件、粘贴截图或粘贴文字，也可以给文件附带一段文字
- `12h / 24h / 3d / 7d` 有效期
- 简短连续编号同时作为 URL 和取件码，例如 `/001`
- 图片和文本在线预览，其他文件直接下载
- 到期立即停止访问，并由 Worker 清理 D1 和 R2 内容
- 单文件限制 50 MB
- 共享上传口令；接收和下载无需登录
- 同一 IP 每小时最多尝试上传 20 次

## 技术结构

- Cloudflare Worker：页面、上传与下载接口
- Cloudflare D1：分享元数据、连续编号与上传限流
- Cloudflare R2：文件、图片和文本内容
- Vinext：React/Next 风格应用构建

## 本地开发

需要 Node.js `>=22.13.0`。

```bash
npm install
cp .env.example .env.local
# 在 .env.local 中设置 UPLOAD_PASSWORD
npm run dev
```

本地开发环境会由 Cloudflare Vite 插件提供 D1 与 R2 模拟存储。

## 验证

```bash
npm test
npm run test:upload-security
npm run lint
```

修改 `db/schema.ts` 后重新生成迁移：

```bash
npm run db:generate
```

## 部署到个人 Cloudflare 账户

先启用 Workers、D1 和 R2，然后创建资源：

```bash
npx wrangler login
npx wrangler d1 create quick-share-db
npx wrangler r2 bucket create quick-share-files
```

复制公开示例配置，并填写自己的 D1 UUID、Worker 名称和域名：

```bash
cp wrangler.direct.example.jsonc wrangler.direct.jsonc
```

`wrangler.direct.jsonc` 是本机私有部署配置，已被 Git 忽略。它声明：

- `DB`：D1 分享元数据
- `SHARE_FILES`：私有 R2 内容
- `ASSETS`：前端静态文件

执行数据库迁移并部署：

```bash
npm run db:migrate:remote
npm run deploy
```

首次部署后设置共享上传口令：

```bash
npx wrangler secret put UPLOAD_PASSWORD -c dist/server/wrangler.json
```

部署脚本会把本机资源配置合并到 Vinext 生成的 Worker 模块清单，并保留服务端依赖模块。

生产环境口令作为 Cloudflare Worker secret 保存，不写入源码或配置。

`worker/index.ts` 提供定时清理 handler，同时在访问发生时每 15 分钟机会性清理一次，避免低流量站点依赖单独的定时触发器。
