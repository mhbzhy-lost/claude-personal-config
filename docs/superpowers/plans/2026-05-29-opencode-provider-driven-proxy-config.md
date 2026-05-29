# OpenCode Provider-Driven Proxy Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the proxy-local `.env` as the source of provider credentials and provider routing config for OpenCode-managed traffic.

**Status:** Implemented in `vendor/opencode-cache-proxy` commit `1e004ef`; parent repo init now delegates provider config ownership to the submodule.

**Architecture:** OpenCode provider auth stores API keys in `~/.local/share/opencode/auth.json`; OpenCode provider `options.headers` carries proxy-only routing/cache knobs to the local proxy. The proxy consumes and strips `x-cache-proxy-*` control headers before forwarding to real upstreams. Dynamic upstream URL control is accepted only from loopback clients, so a proxy bound to a non-local interface cannot be used as an arbitrary upstream forwarder. The submodule owns provider config generation end to end; the parent repo init script only calls the submodule configurator with install paths.

**Tech Stack:** Node.js ESM, OpenCode custom providers, `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, Node test runner, bash init scripts.

---

## Evidence

OpenCode 1.15.12 local probe with fake keys and a local mock server confirmed:

- `@ai-sdk/anthropic` custom provider sends OpenCode auth key as `x-api-key`.
- `@ai-sdk/openai-compatible` custom provider sends OpenCode auth key as
  `Authorization: Bearer <key>`.
- `options.headers` is forwarded for both providers.

This makes provider-driven proxy config feasible without storing provider keys
or upstream URLs in `proxy/.env`.

## File Structure

- Modify `vendor/opencode-cache-proxy/proxy/src/client-config.mjs`
  - Generate OpenCode provider config with no `options.apiKey`.
  - Add proxy-control headers for upstream URL and cache options.
  - Preserve or generate stable Anthropic metadata user id.
- Create `vendor/opencode-cache-proxy/proxy/src/proxy-control-headers.mjs`
  - Parse `x-cache-proxy-*` headers.
  - Strip proxy-only headers before upstream forwarding.
- Modify `vendor/opencode-cache-proxy/proxy/src/server.mjs`
  - Resolve OpenAI-compatible upstream URL and cache strategy per request.
  - Forward OpenCode auth headers instead of relying on env fallback keys.
- Modify `vendor/opencode-cache-proxy/proxy/src/anthropic-handler.mjs`
  - Resolve Anthropic upstream URL, strategy, upstream user-agent, and
    metadata user id per request from control headers.
  - Strip proxy-only headers before forwarding.
- Modify `vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy.mjs`
  - Stop loading `proxy/.env` by default.
  - Keep only process env for runtime-only advanced overrides such as port,
    lifecycle, usage log, and max body size.
- Modify or delete `vendor/opencode-cache-proxy/proxy/src/load-env.mjs`
  - Delete if no tests or e2e scripts need it after migration.
  - Otherwise mark as legacy/manual-test-only and remove production entrypoint use.
- Modify `vendor/opencode-cache-proxy/proxy/.env.example`
  - Replace with a short deprecation note or delete in the same commit.
- Modify docs:
  - `vendor/opencode-cache-proxy/README.md`
  - `vendor/opencode-cache-proxy/proxy/README.md`
  - `docs/knowledge/openai-compatible-cache-proxy.md`
- Modify tests:
  - `vendor/opencode-cache-proxy/proxy/test/client-config.test.mjs`
  - `vendor/opencode-cache-proxy/proxy/test/server.test.mjs`
  - `vendor/opencode-cache-proxy/proxy/test/anthropic-handler.test.mjs`
  - `scripts/test-init-opencode-cache-proxy.sh`

## DAG

- Task 1 is independent and establishes generated OpenCode config.
- Task 2 is independent and introduces control-header parsing.
- Task 3 depends on Task 2.
- Task 4 depends on Task 2.
- Task 5 depends on Tasks 3 and 4.
- Task 6 depends on Task 1.
- Task 7 depends on all implementation tasks.

Parallel set after Task 2: Task 3 and Task 4 can run concurrently.

## Task 1: Generate provider-driven OpenCode config

**Files:**
- Modify: `vendor/opencode-cache-proxy/proxy/src/client-config.mjs`
- Test: `vendor/opencode-cache-proxy/proxy/test/client-config.test.mjs`

- [ ] **Step 1: Write failing tests**

Add assertions that `openai-compatible-cached` and `anthropic-cached` do not
write `options.apiKey`, and do write proxy-control headers:

```js
assert.equal(config.provider["openai-compatible-cached"].options.apiKey, undefined)
assert.equal(
  config.provider["openai-compatible-cached"].options.headers["x-cache-proxy-upstream-base-url"],
  "https://dashscope.aliyuncs.com/compatible-mode/v1",
)
assert.equal(config.provider["anthropic-cached"].options.apiKey, undefined)
assert.equal(
  config.provider["anthropic-cached"].options.headers["x-cache-proxy-upstream-base-url"],
  "https://api.anthropic.com",
)
assert.match(
  config.provider["anthropic-cached"].options.headers["x-cache-proxy-metadata-user-id"],
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
)
```

- [ ] **Step 2: Run RED**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/client-config.test.mjs
```

Expected: FAIL because `openai-compatible-cached.options.apiKey` still exists
and proxy-control headers are not generated.

- [ ] **Step 3: Implement provider headers**

Extend `buildOpenCodeProvider()` and `buildOpenCodeAnthropicProvider()`:

```js
options: {
  baseURL: `http://127.0.0.1:${port}/compatible-mode/v1`,
  headers: {
    "x-cache-proxy-upstream-base-url": upstreamBaseUrl,
    "x-cache-proxy-marker-strategy": markerStrategy,
  },
}
```

For Anthropic:

```js
options: {
  baseURL: `http://127.0.0.1:${port}/apps/anthropic/v1`,
  headers: {
    "x-cache-proxy-upstream-base-url": anthropicUpstreamBaseUrl,
    "x-cache-proxy-cache-strategy": anthropicCacheStrategy,
    "x-cache-proxy-metadata-user-id": metadataUserId,
  },
}
```

Preserve existing `x-cache-proxy-metadata-user-id` if present; generate one only
when absent.

- [ ] **Step 4: Run GREEN**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/client-config.test.mjs
```

Expected: PASS.

## Task 2: Add proxy-control header parser

**Files:**
- Create: `vendor/opencode-cache-proxy/proxy/src/proxy-control-headers.mjs`
- Test: `vendor/opencode-cache-proxy/proxy/test/proxy-control-headers.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { extractProxyControlHeaders } from "../src/proxy-control-headers.mjs"

describe("extractProxyControlHeaders", () => {
  test("extracts known control headers and strips them from upstream headers", () => {
    const result = extractProxyControlHeaders({
      authorization: "Bearer sk-test",
      "x-cache-proxy-upstream-base-url": "https://upstream.example/v1",
      "x-cache-proxy-cache-strategy": "bypass",
      "x-cache-proxy-metadata-user-id": "user-1",
      "x-cache-proxy-unknown": "drop-me",
    })

    assert.equal(result.control.upstreamBaseUrl, "https://upstream.example/v1")
    assert.equal(result.control.cacheStrategy, "bypass")
    assert.equal(result.control.metadataUserId, "user-1")
    assert.deepEqual(result.headers, { authorization: "Bearer sk-test" })
  })
})
```

- [ ] **Step 2: Run RED**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/proxy-control-headers.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement parser**

Implement:

```js
import { isIP } from "node:net"

const PREFIX = "x-cache-proxy-"

export const extractProxyControlHeaders = (headers = {}) => {
  const cleanHeaders = {}
  const control = {}
  for (const [key, value] of Object.entries(headers ?? {})) {
    const lower = key.toLowerCase()
    if (lower.startsWith(PREFIX)) {
      if (lower === "x-cache-proxy-upstream-base-url") control.upstreamBaseUrl = String(value).trim()
      if (lower === "x-cache-proxy-cache-strategy") control.cacheStrategy = String(value).trim()
      if (lower === "x-cache-proxy-marker-strategy") control.markerStrategy = String(value).trim()
      if (lower === "x-cache-proxy-metadata-user-id") control.metadataUserId = String(value).trim()
      if (lower === "x-cache-proxy-upstream-user-agent") control.upstreamUserAgent = String(value).trim()
      continue
    }
    cleanHeaders[key] = value
  }
  return { control, headers: cleanHeaders }
}

const stripRemoteAddressPort = (address) => {
  const normalized = String(address || "").trim().toLowerCase()
  if (normalized.startsWith("[")) {
    const end = normalized.indexOf("]")
    if (end > 0) return normalized.slice(1, end)
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(normalized)) {
    return normalized.replace(/:\d+$/, "")
  }
  return normalized
}

export const isLoopbackRemoteAddress = (address) => {
  const normalized = stripRemoteAddressPort(address)
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice("::ffff:".length) : normalized
  return isIP(ipv4) === 4 && ipv4.startsWith("127.")
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/proxy-control-headers.test.mjs
```

Expected: PASS.

## Task 3: Use request-scoped config for OpenAI-compatible route

**Files:**
- Modify: `vendor/opencode-cache-proxy/proxy/src/server.mjs`
- Test: `vendor/opencode-cache-proxy/proxy/test/server.test.mjs`

- [ ] **Step 1: Write failing tests**

Add a test that sends `Authorization: Bearer sk-client` and
`x-cache-proxy-upstream-base-url: <mock-server>/compatible-mode/v1`; assert the
mock upstream receives `Authorization: Bearer sk-client` and no
`x-cache-proxy-*` headers.

Add a second RED test with `request.socket.remoteAddress = "203.0.113.10"` and
`x-cache-proxy-upstream-base-url`; assert it returns `403` with
`forbidden_proxy_control_header`.

- [ ] **Step 2: Run RED**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/server.test.mjs
```

Expected: FAIL because upstream URL remains process/constructor scoped or
control headers leak upstream.

- [ ] **Step 3: Implement per-request config**

In the chat-completions handler:

```js
const { control, headers: upstreamRequestHeaders } = extractProxyControlHeaders(request.headers)
if (control.upstreamBaseUrl && !isLoopbackRemoteAddress(request.socket?.remoteAddress)) {
  writeJson(response, 403, { error: "forbidden_proxy_control_header" })
  recordOnce({ status: 403, proxy_error: "forbidden_proxy_control_header" })
  return
}
const requestUpstreamBaseUrl = control.upstreamBaseUrl || upstreamBaseUrl
const upstreamUrl = buildUpstreamUrl(request.url, requestUpstreamBaseUrl)
```

Change `forwardHeaders()` to receive `upstreamRequestHeaders` rather than raw
`request.headers`.

- [ ] **Step 4: Run GREEN**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/server.test.mjs
```

Expected: PASS.

## Task 4: Use request-scoped config for Anthropic route

**Files:**
- Modify: `vendor/opencode-cache-proxy/proxy/src/anthropic-handler.mjs`
- Test: `vendor/opencode-cache-proxy/proxy/test/anthropic-handler.test.mjs`

- [ ] **Step 1: Write failing tests**

Add a test that sends:

```js
{
  "x-api-key": "sk-client",
  "x-cache-proxy-upstream-base-url": mockAnthropicBaseUrl,
  "x-cache-proxy-cache-strategy": "bypass",
  "x-cache-proxy-metadata-user-id": "stable-user"
}
```

Assert mock upstream receives `x-api-key: sk-client`, receives no
`x-cache-proxy-*` headers, and the forwarded body is bypassed when strategy is
`bypass`.

Add a second RED test with `request.socket.remoteAddress = "203.0.113.10"` and
`x-cache-proxy-upstream-base-url`; assert it returns `403` with
`forbidden_proxy_control_header`.

- [ ] **Step 2: Run RED**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/anthropic-handler.test.mjs
```

Expected: FAIL because Anthropic config is still constructor scoped.

- [ ] **Step 3: Implement request-scoped Anthropic controls**

Resolve per request:

```js
const { control, headers: upstreamRequestHeaders } = extractProxyControlHeaders(request.headers)
if (control.upstreamBaseUrl && !isLoopbackRemoteAddress(request.socket?.remoteAddress)) {
  writeJson(response, 403, { error: "forbidden_proxy_control_header" })
  recordOnce({ status: 403, proxy_error: "forbidden_proxy_control_header" })
  return
}
const requestUpstreamBaseUrl = control.upstreamBaseUrl || upstreamBaseUrl
const requestCacheStrategy = control.cacheStrategy || cacheOptions.cacheStrategy
const requestMetadataUserId = control.metadataUserId || metadataUserId
const requestUserAgent = control.upstreamUserAgent || upstreamUserAgent
```

Use these values when planning cache markers and forwarding upstream.

- [ ] **Step 4: Run GREEN**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/anthropic-handler.test.mjs
```

Expected: PASS.

## Task 5: Remove production `.env` loading

**Files:**
- Modify: `vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy.mjs`
- Modify/Delete: `vendor/opencode-cache-proxy/proxy/src/load-env.mjs`
- Test: `vendor/opencode-cache-proxy/proxy/test/server.test.mjs`
- Test: `vendor/opencode-cache-proxy/proxy/test/load-env.test.mjs`

- [ ] **Step 1: Write failing test**

Update the entrypoint guard test so production bin must not import
`loadEnvFile`:

```js
const source = await readFile(new URL("../bin/bailian-cache-proxy.mjs", import.meta.url), "utf8")
assert.doesNotMatch(source, /loadEnvFile/)
assert.doesNotMatch(source, /envPath|proxy-local \.env|\.env present|\.env at/)
```

- [ ] **Step 2: Run RED**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/server.test.mjs test/load-env.test.mjs
```

Expected: FAIL because the entrypoint still imports and loads `.env`.

- [ ] **Step 3: Remove production load**

Delete the `loadEnvFile(envPath)` block from `bin/bailian-cache-proxy.mjs`.
Keep process env reads only for runtime controls:

```js
const host = process.env.BAILIAN_CACHE_PROXY_HOST || "127.0.0.1"
const port = envNumber("BAILIAN_CACHE_PROXY_PORT", 48761)
```

Remove provider credential fallback envs from the production entrypoint.

- [ ] **Step 4: Run GREEN**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/server.test.mjs test/load-env.test.mjs
```

Expected: PASS.

## Task 6: Keep provider config ownership inside the submodule

**Files:**
- Modify: `init_opencode.sh`
- Modify: `scripts/test-init-opencode-cache-proxy.sh`

- [ ] **Step 1: Write failing assertions**

Assert generated OpenCode config has:

```py
assert "apiKey" not in config["provider"]["openai-compatible-cached"]["options"]
assert "apiKey" not in config["provider"]["anthropic-cached"]["options"]
assert "x-cache-proxy-upstream-base-url" in config["provider"]["openai-compatible-cached"]["options"]["headers"]
assert "x-cache-proxy-upstream-base-url" in config["provider"]["anthropic-cached"]["options"]["headers"]
```

- [ ] **Step 2: Run RED**

Run:

```bash
bash scripts/test-init-opencode-cache-proxy.sh
```

Expected: FAIL until Task 1 changes are wired through the CLI.

- [ ] **Step 3: Keep provider details out of the parent init script**

Keep provider config defaults and optional overrides in
`vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy-configure.mjs` and
`vendor/opencode-cache-proxy/proxy/src/client-config.mjs`.

The parent `init_opencode.sh` call should be limited to:

```bash
node "$config_cli" opencode \
  --repo-root "$SRC/vendor/opencode-cache-proxy" \
  --opencode-config "$OPENCODE_JSON" \
  --opencode-plugin-mode symlink \
  --opencode-plugin-dir "$plugin_dir" \
  --port "$BAILIAN_CACHE_PROXY_PORT"
```

Do not pass API-key env names, upstream URLs, model lists, or cache strategy
from the parent repo script.

- [ ] **Step 4: Run GREEN**

Run:

```bash
bash scripts/test-init-opencode-cache-proxy.sh
bash init_opencode.sh
opencode models anthropic-cached
opencode models openai-compatible-cached
```

Expected: PASS and both providers visible.

## Task 7: Docs and migration

**Files:**
- Modify: `vendor/opencode-cache-proxy/README.md`
- Modify: `vendor/opencode-cache-proxy/proxy/README.md`
- Modify/Delete: `vendor/opencode-cache-proxy/proxy/.env.example`
- Modify: `docs/knowledge/openai-compatible-cache-proxy.md`

- [ ] **Step 1: Update docs**

Document:

```bash
opencode auth login -p openai-compatible-cached
opencode auth login -p anthropic-cached
```

Document that `proxy/.env` is deprecated and no longer loaded by the production
OpenCode proxy path.

- [ ] **Step 2: Run docs/check validation**

Run:

```bash
rg -n "proxy/.env|OPENAI_COMPATIBLE_API_KEY|ANTHROPIC_API_KEY" \
  vendor/opencode-cache-proxy README.md docs/knowledge init_opencode.sh scripts
git diff --check
git -C vendor/opencode-cache-proxy diff --check
```

Expected: only migration/deprecation references remain.

## Final Verification

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
npm test
cd ../../..
bash scripts/test-init-opencode-cache-proxy.sh
bash -n init_opencode.sh
bash init_opencode.sh
opencode auth list
opencode models anthropic-cached
opencode models openai-compatible-cached
git diff --check
git -C vendor/opencode-cache-proxy diff --check
```

Expected:

- All tests pass.
- Both cached providers are visible.
- OpenCode config contains no `options.apiKey` for cached providers by default.
- Proxy production entrypoint no longer loads `proxy/.env`.
- Provider keys live in OpenCode auth storage.
