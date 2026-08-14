"use client";

import { ChangeEvent, DragEvent, FormEvent, PasteEvent, useRef, useState } from "react";
import Link from "next/link";

const RETENTION_OPTIONS = [
  { label: "12 小时", seconds: 43_200 },
  { label: "24 小时", seconds: 86_400 },
  { label: "3 天", seconds: 259_200 },
  { label: "7 天", seconds: 604_800 },
] as const;

type UploadResult = {
  id: number;
  displayId: string;
  url: string;
  expiresAt: string;
};

function fileSummary(file: File) {
  const units = ["B", "KB", "MB", "GB"];
  let size = file.size;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

export default function Home() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [uploadPassword, setUploadPassword] = useState("");
  const [ttl, setTtl] = useState(86_400);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [pickupCode, setPickupCode] = useState("");
  const [copied, setCopied] = useState(false);

  function chooseFile(nextFile: File | null) {
    if (!nextFile) return;
    setFile(nextFile);
    setError("");
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0] ?? null);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0] ?? null);
  }

  function onPaste(event: PasteEvent<HTMLDivElement>) {
    const pastedFile = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file")
      ?.getAsFile();
    if (pastedFile) {
      event.preventDefault();
      chooseFile(pastedFile);
    }
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    setError("");

    const cleanText = text.trim();
    if (!file && !cleanText) {
      setError("请先选择文件，或粘贴一段文本。 ");
      return;
    }

    const formData = new FormData();
    if (file) formData.append("file", file, file.name);
    if (cleanText) formData.append("text", cleanText);

    setUploading(true);
    try {
      const response = await fetch(`/api/shares?ttl=${ttl}`, {
        method: "POST",
        headers: {
          "x-upload-password": encodeURIComponent(uploadPassword),
        },
        body: formData,
      });
      const payload = (await response.json()) as UploadResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "上传失败，请稍后再试。");

      setResult({
        ...payload,
        url: `${window.location.origin}/${payload.displayId}`,
      });
      setCopied(false);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败，请稍后再试。");
    } finally {
      setUploading(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function receive(event: FormEvent) {
    event.preventDefault();
    const parsed = Number.parseInt(pickupCode, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      window.location.href = `/${parsed}`;
    }
  }

  function resetUpload() {
    setFile(null);
    setText("");
    setResult(null);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <main className="home-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="快传首页">
          <span className="brand-mark">S</span>
          <span>快传</span>
        </Link>
        <span className="privacy-note">临时存放，到期即失效</span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">给朋友传点东西</p>
          <h1>放上来，<br />告诉他编号。</h1>
          <p className="hero-lede">
            文件、图片或一段文字。上传后只会得到一个像 <strong>001</strong> 这样的编号。
          </p>
        </div>

        <div className="utility-stack">
          <section className="upload-card" onPaste={onPaste}>
            {!result ? (
              <form onSubmit={submitUpload}>
                <div className="card-heading">
                  <div>
                    <span className="step-number">01</span>
                    <h2>放入内容</h2>
                  </div>
                  <span className="limit-label">最多 50 MB</span>
                </div>

                <div
                  className={`drop-zone ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
                  onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  <input
                    ref={fileInput}
                    className="visually-hidden"
                    type="file"
                    onChange={onFileChange}
                    id="file-input"
                  />
                  {file ? (
                    <div className="selected-file">
                      <span className="file-tile" aria-hidden="true">{file.type.startsWith("image/") ? "IMG" : "FILE"}</span>
                      <div>
                        <strong>{file.name}</strong>
                        <span>{fileSummary(file)}</span>
                      </div>
                      <button type="button" className="text-button" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }}>
                        移除
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="drop-action" onClick={() => fileInput.current?.click()}>
                      <span className="plus" aria-hidden="true">＋</span>
                      <strong>选择或拖入文件</strong>
                      <span>也可以直接粘贴截图</span>
                    </button>
                  )}
                </div>

                <div className="or-divider"><span>{file ? "附带文字（可选）" : "或者只分享文字"}</span></div>
                <label className="visually-hidden" htmlFor="share-text">要分享的文字</label>
                <textarea
                  id="share-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={file ? "给这个文件附一句话…" : "把要说的话贴在这里…"}
                  rows={4}
                />

                <fieldset className="retention-fieldset">
                  <legend>保留多久</legend>
                  <div className="retention-options">
                    {RETENTION_OPTIONS.map((option) => (
                      <label key={option.seconds} className={ttl === option.seconds ? "is-selected" : ""}>
                        <input
                          type="radio"
                          name="ttl"
                          value={option.seconds}
                          checked={ttl === option.seconds}
                          onChange={() => setTtl(option.seconds)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="password-field" htmlFor="upload-password">
                  <span>上传口令</span>
                  <input
                    id="upload-password"
                    type="password"
                    autoComplete="current-password"
                    value={uploadPassword}
                    onChange={(event) => setUploadPassword(event.target.value)}
                    placeholder="朋友共用的上传口令"
                    required
                  />
                  <small>只限制上传，接收内容不需要口令</small>
                </label>

                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="primary-button" type="submit" disabled={uploading}>
                  <span>{uploading ? "正在上传…" : "生成分享编号"}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </form>
            ) : (
              <div className="success-state" role="status">
                <span className="success-kicker">上传完成</span>
                <p>把这个编号告诉朋友</p>
                <div className="share-number">{result.displayId}</div>
                <div className="share-url">{result.url.replace(/^https?:\/\//, "")}</div>
                <button className="primary-button" type="button" onClick={copyLink}>
                  <span>{copied ? "已复制" : "复制完整链接"}</span>
                  <span aria-hidden="true">{copied ? "✓" : "↗"}</span>
                </button>
                <button className="secondary-button" type="button" onClick={resetUpload}>再传一份</button>
              </div>
            )}
          </section>

          <section className="receive-card">
            <div>
              <span className="step-number">02</span>
              <h2>输入编号接收</h2>
            </div>
            <form onSubmit={receive}>
              <label className="visually-hidden" htmlFor="pickup-code">分享编号</label>
              <input
                id="pickup-code"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={pickupCode}
                onChange={(event) => setPickupCode(event.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="001"
              />
              <button type="submit" aria-label="接收这个编号">接收 <span aria-hidden="true">→</span></button>
            </form>
          </section>
        </div>
      </section>

      <footer>
        <span>由 Cloudflare 临时保管</span>
        <span>编号过期后不再复用</span>
      </footer>
    </main>
  );
}
