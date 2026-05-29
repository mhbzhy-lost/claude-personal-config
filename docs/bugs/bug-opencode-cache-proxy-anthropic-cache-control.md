# opencode-cache-proxy Anthropic cache_control 注入导致百炼 400

## 现象

Claude Code 通过 `vendor/opencode-cache-proxy` 指向百炼 Anthropic 兼容端点时，
上游返回 SSE 错误：

```text
API Error: 400 event:error
data:{"code":"InvalidParameter","message":"Request body format invalid","request_id":"<request_id>"}
```

本地 `~/.cache/bailian-cache-proxy/usage.jsonl` 中同类记录显示：

- `protocol=anthropic`
- `model=qwen3.7-max`
- `status=400`
- `cache_diagnostic.marker_count=3`
- markers 分别落在 `system[2]`、`messages[0].content[0]`、
  `messages[0].content[4]`

也就是说，proxy 在转发前确实改写了 Claude Code 原始请求，并且在同一个 user
message 的多个 content block 上放了多个 `cache_control`。

## 调用链

Claude Code
→ `ANTHROPIC_BASE_URL=http://127.0.0.1:48761/apps/anthropic`
→ `proxy/src/server.mjs` 路由到 Anthropic handler
→ `proxy/src/anthropic-handler.mjs`
→ `planAnthropicCacheMarkers(body, cacheOptions)`
→ `proxy/src/anthropic-cache-planner.mjs` 剥离并重新放置 `cache_control`
→ `https://dashscope.aliyuncs.com/apps/anthropic/v1/messages`
→ 百炼返回 `InvalidParameter / Request body format invalid`

关键代码位置：

- `anthropic-handler.mjs:154-165`：无条件调用 planner，并把改写后的 JSON 发给上游。
- `anthropic-cache-planner.mjs:42-45`：把 `text`、`thinking`、无 `type`
  block 都视为可标记。
- `anthropic-cache-planner.mjs:168-187`：tail + turn anchor 可同时命中同一个
  message 的不同 content block。
- `anthropic-cache-planner.mjs:232-245`：直接给选中的 block 加
  `cache_control: {type: "ephemeral"}`。

## 根因假设

1. **主要根因：planner 按 Anthropic 原生 content-block 粒度放 marker，但百炼
   Qwen3.5+ 之后实际是 message 粒度。**
   阿里云显式缓存文档说明 Qwen3.5 及之后模型仅支持消息级缓存截断点，同一条
   message 的 content 数组内多个 marker 不会产生多个独立截断点。当前 planner
   在 Claude Code 首轮请求中给同一个 `messages[0]` 放两个 marker，和该约束冲突。
2. **次要根因：planner 把 `thinking` block 视为可标记。**
   Anthropic 官方 prompt caching 文档明确说 thinking block 不能直接带
   `cache_control`。Claude Code extended thinking 会把 thinking 内容带回后续请求，
   当前 tail 策略可能把 marker 放到 assistant thinking block 上。
3. **兼容性缺口：proxy 剥离 Claude Code 已生成的 markers 后重排。**
   阿里云文档说明 Claude Code v2.x 默认已携带适配百炼的 `cache_control`
   markers。proxy 现在不以“保留/裁剪客户端 markers”为主，而是全量重排，容易破坏
   Claude Code 原本经过验证的 marker 位置；同时 planner 只统计 system/messages
   markers，若请求 tools 中已有 marker，也可能低估总 marker 数。

假设 1 与本机 400 usage 记录完全吻合；假设 2 是同一 planner 在 extended
thinking 场景下的确定性风险；假设 3 解释了为什么“Claude Code 直连百炼可工作，
接 proxy 后变成 body format invalid”。

## 用户补充证据与修正

用户补充：Claude Code 直连百炼端点的历史日志显示，thinking 相关内容没有被有效
缓存，导致缓存利用率很低。

这个证据不推翻上面的 400 根因，但会修正修复目标：

- **不能只做“保留 Claude Code 已有 markers”**。这最多避免 proxy 破坏直连行为，
  但不能解决直连时 thinking prefill / thinking 历史利用率低的问题。
- **也不能直接给 thinking block 加 `cache_control`**。Anthropic 官方约束明确禁止
  thinking block 直接作为 breakpoint；百炼 Anthropic schema 也没有把 thinking
  列为可挂 `cache_control` 的请求内容块。
- 正确方向应是“安全补 marker”：在没有 marker 或 marker 覆盖不足的请求上，
  把 marker 放到合法的后续 block（如 text、tool_use、tool_result），让它的缓存
  前缀间接包含前面的 thinking 内容；如果一个请求末尾只有 thinking block、后面没有
  合法可标记块，则该 thinking 本身没有合法 breakpoint，只能缓存到它之前的稳定前缀。

## 验证方式

已完成的本地验证：

1. 读取官方资料：
   - Anthropic prompt caching：thinking block 不能直接缓存；最多 4 个
     `cache_control` breakpoints。
   - 百炼显式缓存：Qwen3.5+ 后按 message 粒度处理 marker；同一 message 内多个
     content marker 不产生多个截断点；Claude Code v2.x 默认已带 markers。
2. 读取本地 usage 记录：
   - 2026-05-29 的 Anthropic 400 记录中，proxy diagnostics 显示两个 marker
     落在同一条 `messages[0]`。
3. 用 planner 构造复现：
   - 输入 3 个 system block + 单条 user message、5 个 text content block。
   - `planAnthropicCacheMarkers(..., {minCacheTokens: 1024})` 输出与 usage log
     相同形态：`system[2]`、`messages[0].content[0]`、`messages[0].content[4]`
     三个 marker。
4. 用 planner 构造 thinking 复现：
   - 当最后一个可标记块是 assistant `thinking` 时，planner 会给该 thinking
     block 加 `cache_control`，这违反 Anthropic 官方约束。

初始分析阶段未执行的验证：

- 未用真实 DashScope API 做最小 live probe，避免在未确认前消耗真实额度。
- 未抓取 Claude Code 原始 request body；当前只依赖 usage diagnostic 和官方文档。

后续方案转向 OpenCode + Opus API 后，已执行真实 OpenCode 链路观察，结论记录在
“修复后验证”一节。

## 根因确认

当前确认的代码根因是：`anthropic-cache-planner.mjs` 直接套用了 Anthropic
content-block 级 breakpoint 思路，没有把百炼 Anthropic 兼容端点的 Qwen 约束、
Claude Code 已有 marker 策略、extended thinking 输入限制纳入规划。

因此 proxy 会生成上游不接受或至少不兼容的 `cache_control` 分布，导致百炼以
`Request body format invalid` 拒绝请求。

## 影响范围

- **Claude Code → proxy → 百炼 Anthropic**：高风险。Claude Code v2.x 已自带
  markers，proxy 重排后反而可能破坏请求。
- **extended thinking 后续 turn**：高风险。assistant thinking block 进入历史后，
  tail marker 可能落到 thinking block。
- **多 content block 的单条 user message**：高风险。Claude Code 首轮请求常把
  环境、上下文、用户输入拆成多个 content block，当前策略可能在同一 message 内放
  多个 marker。
- **OpenAI-compatible / Qwen Code 路径**：不直接受影响；本 bug 限于
  `/apps/anthropic/v1/messages` pipeline。

## 最终修复方案

用户后续把 Anthropic 兼容层定位调整为：为 OpenCode + Opus API 组合优化缓存，
不再继续兼容百炼 Anthropic 形态。最终方案如下：

1. **只保留两个模式。**
   - `ANTHROPIC_CACHE_PROXY_STRATEGY=cache`：默认缓存增强模式。
   - `ANTHROPIC_CACHE_PROXY_STRATEGY=bypass`：原始请求体 byte-for-byte 转发，仅记录
     usage，作为兼容性基线。
   - 删除早期设想的 `normalize` / `preserve` / `off` 等中间策略。
2. **Anthropic env 全部中性化。**
   - 移除 `BAILIAN_CACHE_PROXY_ANTHROPIC_*` 命名。
   - `ANTHROPIC_UPSTREAM_BASE_URL` 默认指向标准 Anthropic API 形态。
   - 通过 `ANTHROPIC_CACHE_PROXY_CLAUDE_COMPAT=1` 显式开启上游
     `user-agent` 兼容覆盖，避免中转站对客户端身份做简单拒绝。
3. **缓存 marker 只做合法增强。**
   - 可标记类型限制为 `text`、`tool_use`、`tool_result`。
   - 不直接给 `thinking` / `redacted_thinking` 加 `cache_control`。
   - system/message group 内最多放 1 个 marker，总数不超过 4，并把 tools 中已有
     marker 纳入预算。
   - 当 thinking 后有合法后续块时，用后续合法块的 marker 间接覆盖此前 thinking
     前缀；如果尾部只有 thinking，则只记录 `thinking_uncacheable_tail=true`。
4. **补稳定匿名 metadata.user_id。**
   - `ANTHROPIC_CACHE_PROXY_METADATA_USER_ID` 仅从 env 读取，没有内置默认值。
   - cache 模式下，客户端未传 `metadata.user_id` 时才补该稳定不透明值。
   - bypass 模式不改请求体，仍保持 byte-for-byte 转发。

## 修复后验证

已完成：

```bash
cd vendor/opencode-cache-proxy/proxy
npm test
```

结果：158 个测试全部通过。

真实链路观察：

1. OpenCode 可通过本地 proxy 走 Anthropic 兼容 Opus 上游。
2. `metadata.user_id` 稳定时，同 prompt 第二次请求可读到稳定前缀缓存。
3. `x-claude-code-session-id` 不是缓存命中的必要条件。
4. OpenCode 仍会生成部分跨启动变化的 system 前缀，导致主请求大块缓存不会全量命中；
   后续优化重点应是避开易变 system 块、优先把 marker 放在稳定上下文之后。

## 参考资料

- Anthropic prompt caching 文档：
  https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Claude Code prompt caching 文档：
  https://code.claude.com/docs/en/prompt-caching
- 百炼 Anthropic Messages API 文档：
  https://help.aliyun.com/zh/model-studio/anthropic-api-messages
- 百炼显式缓存最佳实践：
  https://help.aliyun.com/zh/model-studio/explicit-cache-best-practice
- 百炼上下文缓存文档：
  https://help.aliyun.com/zh/model-studio/context-cache
