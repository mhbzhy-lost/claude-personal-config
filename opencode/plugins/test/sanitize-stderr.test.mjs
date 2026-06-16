// Test-first: verify sanitizeStderr redacts secrets before they hit log files
import { strict as assert } from "node:assert"
import { test } from "node:test"
import { sanitizeStderr } from "../external-review-gate.js"

test("redacts Bearer tokens (case-insensitive prefix)", () => {
  const input = "error: Authorization: Bearer sk-abc123-xyz failed"
  const out = sanitizeStderr(input)
  assert.ok(!out.includes("sk-abc123-xyz"), `Bearer leaked: ${out}`)
  assert.ok(out.toLowerCase().includes("bearer"), "Bearer label preserved")
  assert.ok(out.includes("[REDACTED]"))
})

test("redacts x-api-key header values", () => {
  const input = 'request failed: x-api-key: sk-ant-SECRET123'
  const out = sanitizeStderr(input)
  assert.ok(!out.includes("sk-ant-SECRET123"), `api key leaked: ${out}`)
  assert.ok(out.includes("[REDACTED]"))
})

test("redacts query-string API keys", () => {
  const input = "curl https://api.example.com/?api_key=sk-456&model=gpt-4 401"
  const out = sanitizeStderr(input)
  assert.ok(!out.includes("sk-456"), `query key leaked: ${out}`)
  assert.ok(out.includes("api_key=[REDACTED]"))
})

test("redacts JSON-style api_key/token/secret fields", () => {
  const input = '{"error":"unauthorized","api_key":"sk-JWT.token.secret"}'
  const out = sanitizeStderr(input)
  assert.ok(!out.includes("sk-JWT.token.secret"), `JSON key leaked: ${out}`)
  assert.ok(out.includes("[REDACTED]"))
})

test("redacts common env export patterns", () => {
  const input = "export ANTHROPIC_API_KEY=sk-raw-KEY789\nsome error"
  const out = sanitizeStderr(input)
  assert.ok(!out.includes("sk-raw-KEY789"), `env var leaked: ${out}`)
})

test("preserves non-secret content intact", () => {
  const input = "connection timeout to idealab.alibaba-inc.com after 30s"
  const out = sanitizeStderr(input)
  assert.equal(out, input, "non-secret text should pass through unchanged")
})

test("handles empty / non-string input", () => {
  assert.equal(sanitizeStderr(""), "")
  assert.equal(sanitizeStderr(undefined), "")
  assert.equal(sanitizeStderr(null), "")
  assert.equal(sanitizeStderr(123), "123")
})
