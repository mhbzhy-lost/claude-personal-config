# Qwen restart cache miss 诊断缺口

**现象**：多次重启 Qwen Code 并接续已有对话后，`usage.jsonl` 显示每个新 burst
的第一条大上下文请求经常出现 `cached_tokens=0` 或低命中，后续请求又恢复到
约 99% 命中。proxy 进程未重启，说明问题不在本地 proxy 生命周期。

**调用链**：Qwen Code 重启 → `SessionStart` hook 确保本地 cache proxy/keepalive
存活 → Qwen Code 读取已有对话并重新拼装 chat-completions 请求 → proxy 对
`messages` 注入 cache markers → 上游 Bailian 返回 usage → proxy 只记录 usage
数值，不记录可比较的 prefix/marker 指纹。

**根因假设**：

1. Qwen Code 重启后 replay 出来的 API `messages` prefix 与重启前不完全一致。
2. `messages` 总 token 数或 block 结构变化导致 proxy marker 位置变化，进而影响
   上游 cache key。
3. 上游缓存自身有生命周期或 key 粒度变化，即使 prefix/marker 一致也可能冷建。

**验证方式**：为 usage record 增加低敏诊断字段：标准化 `messages` hash、
marker 位置、marker prefix token 位置和 prefix hash。重启前后比较：

- `messages_hash` 变化 → Qwen Code 发给上游的上下文变了。
- `messages_hash` 相同但 marker `prefix_hash` / `prefix_tokens` 变化 → proxy
  marker 规划变了。
- 两者都相同但仍冷建 → 更可能是上游缓存行为。

**根因确认**：当前已确认的直接根因是 usage log 缺少 prefix/marker 指纹，无法区分
“上下文变化”“marker 变化”和“上游缓存变化”。本次只补诊断信息，不直接改变缓存策略。

**影响范围**：所有依赖 `usage.jsonl` 排查 Qwen Code 重启后缓存命中变化的路径都会
受影响。OpenCode 与 Qwen Code 共用 proxy cache planner，因此诊断字段对两端都有用。
