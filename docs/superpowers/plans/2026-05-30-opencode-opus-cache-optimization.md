# OpenCode Opus Cache Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve OpenCode + Anthropic Opus cache observability and reduce early-turn/short-session cache misses without regressing hot-session hit rates.

**Architecture:** Treat this as two separable changes: first normalize Anthropic cache stats so monitoring reports the same token-ratio used by `anthropic-handler.mjs`; then refine marker placement for short conversations where no `turn-prev` anchor exists. Keep the existing `turn-stable` strategy for mature sessions, because current logs show it already reaches 98%+ when warm.

**Tech Stack:** Node.js ESM, `node:test`, Anthropic Messages-compatible usage fields, local JSONL usage logs.

---

## Evidence And Constraints

- OpenCode + Opus today: 143 records with usage, weighted hit ratio 91.15%.
- OpenCode recent hot windows: last 50 records 98.58%, last 20 records 98.18%.
- Main miss cohort: `no-turn-prev` short/early requests, 25 records, 44.18% weighted hit ratio.
- Claude Code `claude-opus-4-6` history: 96.45% weighted hit ratio, recent 100 records 99.61%.
- Existing marker planner already has `turn-stable` and should not be replaced wholesale.
- Existing `cache-stats.mjs` is wrong for Anthropic records because it reads `prompt_tokens/cached_tokens` instead of `input_tokens/cache_read_input_tokens`.

## File Structure

- Modify: `vendor/opencode-cache-proxy/proxy/scripts/cache-stats.mjs`
  - Normalize OpenAI and Anthropic usage records into a shared stats model.
  - Add protocol-aware grouping and correct cache-hit denominator.
- Create: `vendor/opencode-cache-proxy/proxy/test/cache-stats.test.mjs`
  - Execute the CLI against temporary JSONL logs and assert Anthropic/OpenAI stats.
- Modify: `vendor/opencode-cache-proxy/proxy/src/anthropic-cache-planner.mjs`
  - Improve marker selection when there are fewer than two turn anchors.
  - Add diagnostics labels that make cold/short-session behavior inspectable.
- Modify: `vendor/opencode-cache-proxy/proxy/test/anthropic-cache-planner.test.mjs`
  - Add RED/GREEN tests for first-turn and one-prior-turn layouts.
- Modify: `vendor/opencode-cache-proxy/proxy/README.md`
  - Document the Anthropic stats formula and short-session marker behavior.

## DAG

- Task 1 has no dependencies.
- Task 2 depends on Task 1.
- Task 3 has no dependency on Task 1, but should be implemented after Task 1 so stats can validate the effect.
- Task 4 depends on Task 3.
- Task 5 depends on Tasks 1-4.

可并发集合：

- `{Task 1, Task 3}` can run in parallel in separate worktrees because one touches stats and one touches marker planning.
- `{Task 2}` follows Task 1.
- `{Task 4}` follows Task 3.
- `{Task 5}` follows both branches.

## Task 1: Fix Anthropic Cache Stats口径

**Files:**
- Create: `vendor/opencode-cache-proxy/proxy/test/cache-stats.test.mjs`
- Modify: `vendor/opencode-cache-proxy/proxy/scripts/cache-stats.mjs`

- [ ] **Step 1: Write failing CLI test for Anthropic stats**

Create `vendor/opencode-cache-proxy/proxy/test/cache-stats.test.mjs`:

```js
import assert from "node:assert/strict"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const scriptPath = new URL("../scripts/cache-stats.mjs", import.meta.url)

const runStats = async (logPath, args = []) => {
  const { stdout } = await execFileAsync(process.execPath, [
    scriptPath.pathname,
    "--log",
    logPath,
    "--since",
    "all",
    "--json",
    ...args,
  ])
  return JSON.parse(stdout)
}

describe("cache-stats CLI", () => {
  test("computes Anthropic cache hit ratio from cache_read_input_tokens", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cache-stats-anthropic-"))
    const logPath = join(dir, "usage.jsonl")
    try {
      await writeFile(
        logPath,
        [
          JSON.stringify({
            ts: "2026-05-30T00:00:00.000Z",
            protocol: "anthropic",
            model: "claude-opus-4-6",
            status: 200,
            duration_ms: 10,
            is_stream: true,
            stream_usage_seen: true,
            input_tokens: 100,
            cache_read_input_tokens: 900,
            cache_creation_input_tokens: 0,
            output_tokens: 5,
          }),
          JSON.stringify({
            ts: "2026-05-30T00:00:01.000Z",
            protocol: "anthropic",
            model: "claude-opus-4-6",
            status: 200,
            duration_ms: 20,
            is_stream: true,
            stream_usage_seen: true,
            input_tokens: 100,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 900,
            output_tokens: 7,
          }),
        ].join("\n") + "\n",
      )

      const result = await runStats(logPath)

      assert.equal(result.overall.requests, 2)
      assert.equal(result.overall.input_tokens, 200)
      assert.equal(result.overall.cache_read_input_tokens, 900)
      assert.equal(result.overall.cache_creation_input_tokens, 900)
      assert.equal(result.overall.cache_hit_ratio_pct, 45)
      assert.equal(result.groups["claude-opus-4-6"].cache_hit_ratio_pct, 45)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
npm test -- test/cache-stats.test.mjs
```

Expected: FAIL because `input_tokens`, `cache_read_input_tokens`, and Anthropic `cache_hit_ratio_pct` are missing or zero.

- [ ] **Step 3: Implement protocol-normalized stat buckets**

Modify `vendor/opencode-cache-proxy/proxy/scripts/cache-stats.mjs`:

```js
const initBucket = () => ({
  count: 0,
  failures: 0,
  input_tokens: 0,
  prompt_tokens: 0,
  cache_read_input_tokens: 0,
  cached_tokens: 0,
  cache_creation_input_tokens: 0,
  output_tokens: 0,
  completion_tokens: 0,
  total_duration_ms: 0,
  stream_count: 0,
  stream_usage_seen: 0,
})

const normalizedUsage = (r) => {
  const isAnthropic =
    r.protocol === "anthropic" ||
    r.cache_read_input_tokens !== undefined ||
    r.input_tokens !== undefined
  const input = Number(isAnthropic ? r.input_tokens || 0 : r.prompt_tokens || 0)
  const read = Number(isAnthropic ? r.cache_read_input_tokens || 0 : r.cached_tokens || 0)
  const created = Number(r.cache_creation_input_tokens || 0)
  const output = Number(isAnthropic ? r.output_tokens || 0 : r.completion_tokens || 0)
  return { isAnthropic, input, read, created, output }
}

const accumulate = (bucket, r) => {
  const usage = normalizedUsage(r)
  bucket.count += 1
  if (typeof r.status === "number" && r.status >= 400) bucket.failures += 1
  bucket.input_tokens += usage.input
  bucket.prompt_tokens += usage.input
  bucket.cache_read_input_tokens += usage.read
  bucket.cached_tokens += usage.read
  bucket.cache_creation_input_tokens += usage.created
  bucket.output_tokens += usage.output
  bucket.completion_tokens += usage.output
  bucket.total_duration_ms += Number(r.duration_ms || 0)
  if (r.is_stream) {
    bucket.stream_count += 1
    if (r.stream_usage_seen) bucket.stream_usage_seen += 1
  }
}
```

Then update `summarize` so the denominator is `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`:

```js
const cacheDenominator = (b) =>
  b.input_tokens + b.cache_read_input_tokens + b.cache_creation_input_tokens

const summarize = (b) => ({
  requests: b.count,
  failures: b.failures,
  success_rate_pct: ratio(b.count - b.failures, b.count),
  avg_duration_ms: b.count > 0 ? Math.round(b.total_duration_ms / b.count) : 0,
  input_tokens: b.input_tokens,
  prompt_tokens: b.prompt_tokens,
  cache_read_input_tokens: b.cache_read_input_tokens,
  cached_tokens: b.cached_tokens,
  cache_creation_input_tokens: b.cache_creation_input_tokens,
  output_tokens: b.output_tokens,
  completion_tokens: b.completion_tokens,
  cache_hit_ratio_pct: ratio(b.cache_read_input_tokens, cacheDenominator(b)),
  stream_requests: b.stream_count,
  stream_usage_capture_pct: ratio(b.stream_usage_seen, b.stream_count),
})
```

- [ ] **Step 4: Run focused test**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
npm test -- test/cache-stats.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run all proxy tests**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add vendor/opencode-cache-proxy/proxy/scripts/cache-stats.mjs vendor/opencode-cache-proxy/proxy/test/cache-stats.test.mjs
git commit -m "fix(cache-proxy): report anthropic cache hit ratio"
```

## Task 2: Add Cold-Cohort Breakdown To Stats

**Files:**
- Modify: `vendor/opencode-cache-proxy/proxy/scripts/cache-stats.mjs`
- Modify: `vendor/opencode-cache-proxy/proxy/test/cache-stats.test.mjs`

- [ ] **Step 1: Write failing test for marker cohort grouping**

Append this test to `cache-stats.test.mjs`:

```js
test("groups Anthropic records by turn-prev marker cohort", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cache-stats-cohort-"))
  const logPath = join(dir, "usage.jsonl")
  try {
    await writeFile(
      logPath,
      [
        JSON.stringify({
          ts: "2026-05-30T00:00:00.000Z",
          protocol: "anthropic",
          model: "claude-opus-4-6",
          status: 200,
          duration_ms: 10,
          is_stream: true,
          stream_usage_seen: true,
          input_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 999,
          cache_diagnostic: { markers: [] },
        }),
        JSON.stringify({
          ts: "2026-05-30T00:00:01.000Z",
          protocol: "anthropic",
          model: "claude-opus-4-6",
          status: 200,
          duration_ms: 10,
          is_stream: true,
          stream_usage_seen: true,
          input_tokens: 1,
          cache_read_input_tokens: 999,
          cache_creation_input_tokens: 0,
          cache_diagnostic: {
            markers: [{ location: "turn-prev", prefix_hash: "prev-a" }],
          },
        }),
      ].join("\n") + "\n",
    )

    const result = await runStats(logPath, ["--by", "turn-prev"])

    assert.equal(result.by, "turn-prev")
    assert.equal(result.groups["no-turn-prev"].requests, 1)
    assert.equal(result.groups["no-turn-prev"].cache_hit_ratio_pct, 0)
    assert.equal(result.groups["prev-a"].requests, 1)
    assert.equal(result.groups["prev-a"].cache_hit_ratio_pct, 99.9)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
npm test -- test/cache-stats.test.mjs
```

Expected: FAIL with `unknown arg` or missing group because `--by turn-prev` is unsupported.

- [ ] **Step 3: Implement `--by turn-prev`**

Modify argument validation and `groupKeyFor`:

```js
const validGroupBys = new Set(["model", "status", "protocol", "turn-prev"])

// in arg parsing after reading --by
else if (a === "--by") {
  args.by = requireValue("--by", argv[++i])
  if (!validGroupBys.has(args.by)) {
    console.error(`invalid --by: ${args.by}`)
    process.exit(2)
  }
}

const turnPrevKey = (r) =>
  r.cache_diagnostic?.markers?.find((m) => m.location === "turn-prev")?.prefix_hash ||
  "no-turn-prev"

const groupKeyFor = (r) => {
  if (args.by === "status") return String(r.status ?? "unknown")
  if (args.by === "protocol") return r.protocol || "openai-compatible"
  if (args.by === "turn-prev") return turnPrevKey(r)
  return r.model || "unknown"
}
```

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
npm test -- test/cache-stats.test.mjs
npm test
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add vendor/opencode-cache-proxy/proxy/scripts/cache-stats.mjs vendor/opencode-cache-proxy/proxy/test/cache-stats.test.mjs
git commit -m "feat(cache-proxy): expose cold cache cohorts"
```

## Task 3: Improve Short-Conversation Marker Planning

**Files:**
- Modify: `vendor/opencode-cache-proxy/proxy/src/anthropic-cache-planner.mjs`
- Modify: `vendor/opencode-cache-proxy/proxy/test/anthropic-cache-planner.test.mjs`

- [ ] **Step 1: Write failing first-turn stability test**

Append this test:

```js
test("uses first user anchor for first-turn tool-heavy conversations", () => {
  const messages = [userText(repeat("initial-user", 300))]
  for (let i = 0; i < 6; i++) {
    messages.push(toolUse(`t${i}`, `tool_${i}`))
    messages.push(toolResult(`t${i}`, repeat(`result${i}`, 120)))
  }
  const body = {
    model: "claude-opus-4-6",
    system: systemBlocks(repeat("system", 300)),
    messages,
  }

  const { diagnostics } = planAnthropicCacheMarkers(body, { minCacheTokens: 32 })
  const labels = diagnostics.markers.map((m) => m.location)

  assert.ok(labels.includes("system"))
  assert.ok(labels.includes("turn-current"))
  assert.ok(labels.includes("early-stable"))
  assert.ok(labels.includes("tail"))
  assert.notEqual(labels.includes("fraction"), true)
})
```

- [ ] **Step 2: Write failing one-prior-turn test**

Append this test:

```js
test("uses previous and current user anchors before falling back in two-turn conversations", () => {
  const body = {
    model: "claude-opus-4-6",
    system: systemBlocks(repeat("system", 300)),
    messages: [
      userText(repeat("turn1-user", 300)),
      assistantText(repeat("turn1-assistant", 300)),
      userText(repeat("turn2-user", 300)),
      toolUse("t1", "read"),
      toolResult("t1", repeat("result", 300)),
    ],
  }

  const { diagnostics } = planAnthropicCacheMarkers(body, { minCacheTokens: 32 })
  const labels = diagnostics.markers.map((m) => m.location)

  assert.ok(labels.includes("turn-prev"))
  assert.ok(labels.includes("turn-current"))
  assert.ok(labels.includes("tail"))
})
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
npm test -- test/anthropic-cache-planner.test.mjs
```

Expected: FAIL because the current fallback may label missing slots as `fraction`.

- [ ] **Step 4: Implement short-conversation marker fallback**

Modify `planAnthropicCacheMarkers` after selecting turn anchors and before fraction fallback:

```js
  const firstTurnAnchor = eligible.find((b) => b.isTurnAnchor)
  const lastTurnAnchor = [...eligible].reverse().find(
    (b) => b.isTurnAnchor && b.globalIndex !== tail.globalIndex,
  )

  if (turnAnchors.length === 1 && firstTurnAnchor) {
    selectBlock(firstTurnAnchor, "early-stable")
  }

  if (turnAnchors.length === 0 && firstTurnAnchor) {
    selectBlock(firstTurnAnchor, "turn-current")
  }

  if (selected.size < markerBudget && lastTurnAnchor) {
    selectBlock(lastTurnAnchor, "early-stable")
  }
```

Then keep the existing fraction fallback as the final fallback only when stable anchors are unavailable.

- [ ] **Step 5: Run planner tests**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
npm test -- test/anthropic-cache-planner.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run all proxy tests**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add vendor/opencode-cache-proxy/proxy/src/anthropic-cache-planner.mjs vendor/opencode-cache-proxy/proxy/test/anthropic-cache-planner.test.mjs
git commit -m "feat(cache-proxy): stabilize early anthropic cache markers"
```

## Task 4: Add Regression Analysis Fixtures

**Files:**
- Create: `vendor/opencode-cache-proxy/proxy/test/fixtures/anthropic-opus-cache-sample.jsonl`
- Modify: `vendor/opencode-cache-proxy/proxy/test/cache-stats.test.mjs`

- [ ] **Step 1: Create deterministic sample log**

Create `vendor/opencode-cache-proxy/proxy/test/fixtures/anthropic-opus-cache-sample.jsonl`:

```jsonl
{"ts":"2026-05-30T00:00:00.000Z","protocol":"anthropic","model":"claude-opus-4-6","status":200,"duration_ms":100,"is_stream":true,"stream_usage_seen":true,"input_tokens":3,"cache_read_input_tokens":0,"cache_creation_input_tokens":102054,"output_tokens":10,"cache_diagnostic":{"markers":[{"location":"system","prefix_hash":"sys-a"},{"location":"turn-current","prefix_hash":"cur-a"},{"location":"tail","prefix_hash":"tail-a"}]}}
{"ts":"2026-05-30T00:01:00.000Z","protocol":"anthropic","model":"claude-opus-4-6","status":200,"duration_ms":100,"is_stream":true,"stream_usage_seen":true,"input_tokens":3,"cache_read_input_tokens":158146,"cache_creation_input_tokens":1282,"output_tokens":10,"cache_diagnostic":{"markers":[{"location":"system","prefix_hash":"sys-a"},{"location":"turn-prev","prefix_hash":"prev-a"},{"location":"turn-current","prefix_hash":"cur-b"},{"location":"tail","prefix_hash":"tail-b"}]}}
{"ts":"2026-05-30T00:02:00.000Z","protocol":"anthropic","model":"claude-opus-4-6","status":200,"duration_ms":100,"is_stream":true,"stream_usage_seen":true,"input_tokens":16882,"cache_read_input_tokens":196154,"cache_creation_input_tokens":0,"output_tokens":10,"cache_diagnostic":{"markers":[{"location":"system","prefix_hash":"sys-a"},{"location":"turn-prev","prefix_hash":"prev-b"},{"location":"turn-current","prefix_hash":"cur-c"},{"location":"tail","prefix_hash":"tail-c"}]}}
```

- [ ] **Step 2: Add fixture-based stats test**

Append:

```js
test("reports weighted ratio for the checked-in Anthropic Opus sample", async () => {
  const fixturePath = new URL("./fixtures/anthropic-opus-cache-sample.jsonl", import.meta.url).pathname
  const result = await runStats(fixturePath)

  assert.equal(result.overall.requests, 3)
  assert.equal(result.overall.cache_read_input_tokens, 354300)
  assert.equal(result.overall.cache_creation_input_tokens, 103336)
  assert.equal(result.overall.input_tokens, 16888)
  assert.equal(result.overall.cache_hit_ratio_pct, 74.66)
})
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
npm test -- test/cache-stats.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add vendor/opencode-cache-proxy/proxy/test/cache-stats.test.mjs vendor/opencode-cache-proxy/proxy/test/fixtures/anthropic-opus-cache-sample.jsonl
git commit -m "test(cache-proxy): add anthropic opus cache fixture"
```

## Task 5: Documentation And Verification

**Files:**
- Modify: `vendor/opencode-cache-proxy/proxy/README.md`

- [ ] **Step 1: Update stats documentation**

Add this under “Usage Observability”:

```markdown
For Anthropic-compatible records, cache hit ratio is computed as:

```text
cache_read_input_tokens /
  (input_tokens + cache_read_input_tokens + cache_creation_input_tokens)
```

For OpenAI-compatible records, the same normalized fields are derived from
`prompt_tokens`, `prompt_tokens_details.cached_tokens`, and
`prompt_tokens_details.cache_creation_input_tokens`.
```

- [ ] **Step 2: Document cold cohort command**

Add this command example:

```bash
node proxy/scripts/cache-stats.mjs --since today --by turn-prev
```

Explain:

```markdown
The `no-turn-prev` cohort captures first-turn and short-session requests where
the proxy cannot yet place a previous-turn anchor. This cohort is expected to
have lower hit rate than mature sessions and is the first place to inspect when
daily aggregate hit rate drops while recent hot-session hit rate remains high.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
cd vendor/opencode-cache-proxy/proxy
npm test
node scripts/cache-stats.mjs --since today --by turn-prev --json
node scripts/cache-stats.mjs --since today --json
```

Expected:

- `npm test`: PASS.
- `--by turn-prev`: emits JSON with `groups.no-turn-prev` when such records exist.
- `--json`: `overall.cache_hit_ratio_pct` for Opus is no longer `0`.

- [ ] **Step 4: Commit**

```bash
git add vendor/opencode-cache-proxy/proxy/README.md
git commit -m "docs(cache-proxy): document anthropic cache metrics"
```

## Risk Controls

- Do not change provider config or auth in this plan.
- Do not replace `turn-stable`; only improve the early/short-session fallback.
- Keep all new metrics metadata-only; no prompt or completion text is logged.
- Preserve the current `cache_diagnostic.markers` shape and only add new `location` labels.

## Final Validation Checklist

- [ ] `cd vendor/opencode-cache-proxy/proxy && npm test`
- [ ] `node vendor/opencode-cache-proxy/proxy/scripts/cache-stats.mjs --since today --json`
- [ ] `node vendor/opencode-cache-proxy/proxy/scripts/cache-stats.mjs --since today --by turn-prev --json`
- [ ] Confirm Anthropic Opus stats use nonzero `input_tokens/cache_read_input_tokens/cache_creation_input_tokens`.
- [ ] Confirm hot-session cohorts still report around 98%+ on existing local logs.

## Self-Review

- Spec coverage: stats口径、短会话 marker、Claude Code 对比背景、验证方式均有任务覆盖。
- Placeholder scan: no TBD/TODO/implement-later placeholders remain.
- Type consistency: all code snippets use existing ESM imports, existing `cache_diagnostic.markers`, and existing usage field names.
