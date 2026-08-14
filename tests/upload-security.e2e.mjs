import assert from "node:assert/strict";

const baseUrl = process.argv[2] ?? "http://localhost:3217";
const password = process.argv[3] ?? "local-security-test";
const endpoint = `${baseUrl}/api/shares?ttl=43200`;
const ipPrefix = `198.51.${Math.floor(Math.random() * 200) + 1}`;

async function upload(suppliedPassword, ip, text = "security test") {
  const body = new FormData();
  body.set("text", text);
  const headers = { "x-forwarded-for": ip };
  if (suppliedPassword !== null) {
    headers["x-upload-password"] = encodeURIComponent(suppliedPassword);
  }
  return fetch(endpoint, { method: "POST", headers, body });
}

const missing = await upload(null, `${ipPrefix}.10`);
assert.equal(missing.status, 401, "missing upload password must be rejected");

const wrong = await upload("wrong", `${ipPrefix}.11`);
assert.equal(wrong.status, 401, "wrong upload password must be rejected");

const accepted = await upload(password, `${ipPrefix}.12`);
assert.equal(accepted.status, 201, `correct upload password failed: ${await accepted.text()}`);

let limited;
for (let attempt = 1; attempt <= 21; attempt += 1) {
  limited = await upload("wrong", `${ipPrefix}.99`, `rate limit attempt ${attempt}`);
  assert.equal(limited.status, attempt <= 20 ? 401 : 429, `unexpected status on attempt ${attempt}`);
}
assert.ok(Number(limited.headers.get("retry-after")) > 0, "rate limit must include Retry-After");

console.log("PASS upload password accepts the configured secret and rejects missing/wrong secrets");
console.log("PASS upload attempts are limited to 20 per IP per hour");
