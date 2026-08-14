import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.argv[2] ?? "http://localhost:3000";

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

async function waitForExpression(client, expression, label) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const result = await client.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (result.result.value) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForSelector(client, selector) {
  return waitForExpression(
    client,
    `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    selector,
  );
}

async function uiState(client) {
  const result = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector("#file-input");
      return {
        nativeFileCount: input?.files?.length ?? -1,
        showsSelectedFile: Boolean(document.querySelector(".selected-file")),
        showsFilePicker: Boolean(document.querySelector(".drop-action")),
        textValue: document.querySelector("#share-text")?.value ?? "",
      };
    })()`,
    returnByValue: true,
  });
  return result.result.value;
}

const profileDir = await mkdtemp(join(tmpdir(), "quick-share-chrome-"));
const fixturePath = join(profileDir, "same-file.txt");
await writeFile(fixturePath, "same file selected twice", "utf8");

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
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`, {
    method: "PUT",
  });
  const target = await targetResponse.json();
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  await client.send("Runtime.enable");
  await client.send("DOM.enable");
  await waitForSelector(client, "#file-input");
  await waitForExpression(
    client,
    `Object.keys(document.querySelector("#file-input")).some((key) => key.startsWith("__reactProps"))`,
    "React hydration",
  );

  const document = await client.send("DOM.getDocument");
  const fileInput = await client.send("DOM.querySelector", {
    nodeId: document.root.nodeId,
    selector: "#file-input",
  });
  await client.send("DOM.setFileInputFiles", {
    nodeId: fileInput.nodeId,
    files: [fixturePath],
  });
  await client.send("Runtime.evaluate", {
    expression: `document.querySelector("#file-input").dispatchEvent(new Event("change", { bubbles: true }))`,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.deepEqual(await uiState(client), {
    nativeFileCount: 1,
    showsSelectedFile: true,
    showsFilePicker: false,
    textValue: "",
  });

  await client.send("Runtime.evaluate", {
    expression: `(() => {
      const textarea = document.querySelector("#share-text");
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setValue.call(textarea, "切换到文字");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    })()`,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.deepEqual(
    await uiState(client),
    {
      nativeFileCount: 1,
      showsSelectedFile: true,
      showsFilePicker: false,
      textValue: "切换到文字",
    },
    "typing a note must preserve the selected file so one share can contain both",
  );

  console.log("PASS file + text remain selected together");
} finally {
  client?.close();
  chrome.kill("SIGTERM");
  await new Promise((resolve) => chrome.once("exit", resolve));
  await rm(profileDir, { recursive: true, force: true });
}
