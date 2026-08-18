"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Vinext currently intercepts these Link clicks without completing navigation. */

import { useEffect, useMemo, useState } from "react";

type ShareMetadata = {
  id: number;
  displayId: string;
  kind: "text" | "image" | "file";
  name: string;
  contentType: string;
  size: number;
  noteText: string | null;
  createdAt: string;
  expiresAt: string;
};

function displaySize(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function remainingLabel(milliseconds: number) {
  if (milliseconds <= 0) return "已过期";
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 60) return `剩余 ${minutes} 分钟`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `剩余 ${hours} 小时`;
  return `剩余 ${Math.ceil(hours / 24)} 天`;
}

export function ShareView({ requestedId }: { requestedId: string }) {
  const [share, setShare] = useState<ShareMetadata | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"ready" | "missing" | "expired" | "error">("ready");
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);

  const contentUrl = useMemo(
    () => share ? `/api/shares/${share.id}/content` : "",
    [share],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/shares/${encodeURIComponent(requestedId)}`, { cache: "no-store" });
        const payload = (await response.json()) as ShareMetadata & { error?: string };
        if (cancelled) return;
        if (response.status === 410) {
          setStatus("expired");
        } else if (response.status === 404) {
          setStatus("missing");
        } else if (!response.ok) {
          setStatus("error");
        } else {
          setShare(payload);
          if (payload.kind === "text") {
            const contentResponse = await fetch(`/api/shares/${payload.id}/content`, { cache: "no-store" });
            if (!contentResponse.ok) throw new Error("Unable to load text");
            const content = await contentResponse.text();
            if (!cancelled) setText(content);
          }
        }
      } catch {
        if (!cancelled) setStatus("error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [requestedId]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function copyText() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const expiredByClock = share ? Date.parse(share.expiresAt) <= now : false;

  return (
    <div className="share-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="快传首页">
          <span className="brand-mark">S</span>
          <span>快传</span>
        </a>
        <span className="privacy-note">收到后记得及时保存</span>
      </header>

      <main className="share-main">
        <section className="share-card">
          {loading ? (
            <div className="share-status" role="status">
              <span className="success-kicker">正在取件</span>
              <h1>稍等一下</h1>
            </div>
          ) : status !== "ready" || expiredByClock ? (
            <div className="share-status">
              <span className="success-kicker">{status === "missing" ? "没有找到" : "无法取件"}</span>
              <h1>{status === "expired" || expiredByClock ? "这个分享已过期" : status === "missing" ? "编号不存在" : "暂时读取失败"}</h1>
              <p>{status === "expired" || expiredByClock ? "内容已经停止访问，请让发送者重新上传。" : "请检查编号，或稍后再试一次。"}</p>
              <a href="/">返回首页</a>
            </div>
          ) : share ? (
            <>
              <div className="share-card-header">
                <div>
                  <span className="success-kicker">朋友发来的内容</span>
                  <h1>{share.name}</h1>
                  <div className="share-meta">
                    <span>{displaySize(share.size)}</span>
                    <span>{remainingLabel(Date.parse(share.expiresAt) - now)}</span>
                  </div>
                </div>
                <span className="share-id-badge">#{share.displayId}</span>
              </div>

              {share.kind === "text" && <pre className="text-preview">{text}</pre>}
              {share.kind !== "text" && share.noteText && (
                <div className="note-block">
                  <span>附带文字</span>
                  <pre className="text-preview">{share.noteText}</pre>
                </div>
              )}
              {/* Private, expiring R2 images intentionally bypass the public image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {share.kind === "image" && <img className="image-preview" src={contentUrl} alt={share.name} />}
              {share.kind === "file" && (
                <div className="file-preview">
                  <div>
                    <span className="file-tile" aria-hidden="true">FILE</span>
                    <strong>{share.name}</strong>
                    <span>{displaySize(share.size)}</span>
                  </div>
                </div>
              )}

              <div className="share-actions">
                {share.kind === "text" ? (
                  <button className="primary-button" type="button" onClick={copyText}>
                    <span>{copied ? "已复制文字" : "复制文字"}</span><span aria-hidden="true">{copied ? "✓" : "↗"}</span>
                  </button>
                ) : (
                  <a className="primary-button" href={`${contentUrl}?download=1`} download>
                    <span>下载文件</span><span aria-hidden="true">↓</span>
                  </a>
                )}
                <a className="secondary-button" href="/">返回首页</a>
              </div>
            </>
          ) : null}
        </section>
      </main>

      <footer>
        <span>编号 {share?.displayId ?? requestedId}</span>
        <span>内容由 Cloudflare 临时保管</span>
      </footer>
    </div>
  );
}
