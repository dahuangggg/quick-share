import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const detailUrl = process.argv[2] ?? "http://localhost:3000/999999999999";
const expectedHomeUrl = new URL("/", detailUrl).href;

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForFile(path, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "Browser evaluation failed");
  }
  return result.result.value;
}

async function waitFor(client, expression, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const profileDir = await mkdtemp(join(tmpdir(), "quick-share-home-navigation-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-port=0",
  `--user-data-dir=${profileDir}`,
  "about:blank",
], { stdio: "ignore" });

let client;
try {
  const activePort = await waitForFile(join(profileDir, "DevToolsActivePort"));
  const [port] = activePort.trim().split("\n");
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(detailUrl)}`, {
    method: "PUT",
  });
  const target = await targetResponse.json();
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  await client.send("Runtime.enable");

  await waitFor(
    client,
    `Array.from(document.querySelectorAll("a")).some((link) => link.textContent?.trim() === "返回首页")`,
    "the return-home link",
  );
  await new Promise((resolve) => setTimeout(resolve, 250));

  await evaluate(client, `(() => {
    const link = Array.from(document.querySelectorAll("a")).find((candidate) => candidate.textContent?.trim() === "返回首页");
    link.click();
    return true;
  })()`);

  await waitFor(client, `location.href === ${JSON.stringify(expectedHomeUrl)}`, "navigation to the home page");
  assert.equal(await evaluate(client, "location.href"), expectedHomeUrl);
  console.log("PASS return-home link navigates to the home page");
} finally {
  client?.close();
  chrome.kill("SIGTERM");
  await new Promise((resolve) => chrome.once("exit", resolve));
  await rm(profileDir, { recursive: true, force: true });
}
