# OpenCode Opus no-turn-prev 长请求只命中浅前缀

**现象**：2026-05-31 今日 OpenCode Opus usage 约 469 条记录，按 Anthropic
口径计算整体 cache hit ratio 只有 72.68%。其中 `no-turn-prev` cohort 有 266
条、12.81M denominator，命中率 61.15%；system hash `c614663ae1fcbe2d` 组
108 条、5.37M denominator，命中率只有 44.07%。

**调用链**：OpenCode 发起 Anthropic Messages 请求 → proxy
`anthropic-handler.mjs` 调 `planAnthropicCacheMarkers` → planner 在没有 previous
user turn 时选择 `system`、`turn-current`、`early-stable`、`tail` → 因为 marker
预算已满，fraction fallback 不运行 → 20-block lookback guard 发现 tail 距离
`early-stable` 太远，把 tail 拉回到浅位置 → 上游只能命中约 20k-36k 固定前缀。

**根因假设**：`early-stable` 对短 first-turn/tool-heavy 请求有帮助，但长
`no-turn-prev` 请求中它过早占用唯一可用的中段 marker 槽位，导致深层稳定前缀永远
不会被标记。

**验证方式**：

- 分析 `~/.cache/bailian-cache-proxy/usage.jsonl` 今日 Anthropic Opus 记录：
  `no-turn-prev` 命中率 61.15%，显著低于非 `no-turn-prev` 的约 80%。
- 观察 `c614663ae1fcbe2d` 组连续请求：marker selection 固定，但 marker prefix
  多为 `system:3945, turn-current:5409, early-stable:57xx, tail:7xxx`；随着
  `input_tokens` 从 14k 增至 42k，命中率从 61% 降至 35%。
- 这类请求间隔只有数秒，且后续 `cache_creation_input_tokens=0`、固定
  `cache_read_input_tokens`，不像 TTL 过期。

**根因确认**：planner 在 `turnAnchors.length < 2` 时无条件优先选择最早的
`early-stable`，使长单 turn/compact 后请求无法放置深层稳定 marker。20-block guard
随后把 tail 也限制在浅前缀附近。

**影响范围**：OpenCode compact 后、first-turn tool-heavy、或长时间只有一个 user
turn anchor 的 agent loop。表现为不是完全 miss，而是固定浅前缀 hit、后续大量
新增上下文算 uncached input。

**修复方案要求**：

- 对长 `no-turn-prev` 请求，优先选择 token bucket 深层稳定 marker，而不是最早
  `early-stable`。
- 保持短 first-turn 请求现有 `early-stable` 行为，避免过早引入漂移。
- 保持 one-marker-per-message 和 20-block lookback 约束。
- 增加 planner 回归测试，证明长 `no-turn-prev` 的第三个 marker 不再停留在浅前缀。
