# Bug: OpenCode qwen3.7-max 自述为 Claude

状态：已完成配置与日志排查；暂不修改代码或配置，待用户确认下一步。

## 现象

用户在 OpenCode 中选择自定义 provider 的 `qwen3.7-max` 后询问“你是什么模型”，
模型回复自己是 Claude，并声称 `qwen3.7-max` 只是路由配置。

## 根因分析 (6 要素)

1. **触发条件**：OpenCode session 使用 `providerID=openai-compatible-cached`、
   `modelID=qwen3.7-max`，用户直接询问模型身份。
2. **期望链路**：`qwen3.7-max` 应通过 OpenAI-compatible provider 走本地 proxy 的
   `/compatible-mode/v1/chat/completions`，再转发到
   `https://dashscope.aliyuncs.com/compatible-mode/v1`。
3. **实际链路**：本机 `~/.config/opencode/opencode.json` 中
   `qwen3.7-max` 只存在于 `openai-compatible-cached` provider；该 provider 使用
   `@ai-sdk/openai-compatible`，baseURL 是
   `http://127.0.0.1:48761/compatible-mode/v1`。OpenCode 日志中本次请求也记录为
   `providerID=openai-compatible-cached`、`modelID=qwen3.7-max`。
4. **关键假设失效**：不能仅凭模型自述判断路由端点。模型身份自述可能受 system
   prompt、上游路由、历史上下文或供应商模型行为影响；这次日志不支持“误走
   Anthropic provider”。
5. **旁证**：
   - `~/.local/share/opencode/log/2026-06-02T065243.log` 记录 06:53 的请求：
     `providerID=openai-compatible-cached modelID=qwen3.7-max`。
   - 同一日志记录 runtime 选择：
     `llm.provider=openai-compatible-cached llm.model=qwen3.7-max`。
   - `~/.cache/bailian-cache-proxy/usage.jsonl` 对应记录为
     `model=qwen3.7-max status=200 request_id=chatcmpl-*`，没有
     `protocol=anthropic` 字段，符合 OpenAI-compatible 路径。
   - 失败重试记录的错误 metadata URL 是
     `http://127.0.0.1:48761/compatible-mode/v1/chat/completions`，不是
     `/apps/anthropic/v1/messages`。
6. **实现偏差**：当前配置同时安装了 `openai-compatible-cached` 和
   `anthropic-idealab-cached` 两个 provider，且近期日志中二者并行存在；但缺少一条
   面向用户的“当前请求最终走哪个 provider/upstream”的快速诊断命令，导致身份自述
   异常时容易误判为 provider 串路由。

## 当前结论

这次 `qwen3.7-max` 请求没有错误走 `anthropic-idealab-cached` provider。配置层面：

- `openai-compatible-cached/qwen3.7-max` → `/compatible-mode/v1/chat/completions`
- `anthropic-idealab-cached/claude-opus-4-6-*` → `/apps/anthropic/v1/messages`

用户看到的“我是 Claude”更可能来自上游模型身份自述、OpenCode 注入上下文或 provider
上游服务内部路由，而不是本地 provider 配置把 qwen 模型发到了 Anthropic 端点。

## 追加排查：身份误判来源

用本机假 upstream 抓取 OpenCode 发给 `@ai-sdk/openai-compatible` 的完整请求体：

1. **最小隔离环境**：临时 HOME、`--pure`、只配置
   `openai-compatible-cached/qwen3.7-max`，且设置
   `OPENCODE_DISABLE_CLAUDE_CODE=1`。抓到的 system prompt 以
   `You are opencode, an interactive CLI tool...` 开头，长度约 9708 字符，
   不包含 `Claude` 或 `Anthropic`。
2. **加入本机 OpenCode 全局 AGENTS 注入**：临时 HOME 中把
   `.config/opencode/AGENTS.md` 链到本仓 `claude/CLAUDE.md`，并链入
   `Superpowers.md`。同样的 `qwen3.7-max` 请求 system prompt 长度约 16507
   字符，包含 7 次 `Claude/claude` 和 1 次 `Anthropic`。
3. **命中的内容不是身份声明**：这些命中来自工作目录
   `/Users/leshi.zhy/claude-workspace`、规则里的 `~/.claude/memory.md`、以及 skill
   描述“Claude 同族 review / claude CLI 调 Anthropic 兼容网关”等。
4. **实际日志吻合**：06:53 那次模型 reasoning 明确写出
   `Based on the system information` 后才回答自己是 Claude。也就是说它把 system
   prompt 里的 Claude 相关环境信息误读成了“自身身份信息”。

更新后的根因判断：本地 provider 没有串到 Anthropic；`qwen3.7-max` 是在
OpenAI-compatible 路径上，被本仓面向 Claude/OpenCode/Codex 混合配置中的
`Claude/Anthropic` 字样污染了身份问答。该污染主要是语义层面的 prompt 误导，
不是路由层面的端点错误。

## 建议下一步

先不要改路由配置。建议下一步做最小诊断增强：

- 给 proxy usage 记录补充 `upstream_base_url` 或 `protocol`，使 OpenAI-compatible
  与 Anthropic 路径在统计中一眼可辨。
- 增加一个本地只读诊断脚本，输出最近 N 条 usage 与 OpenCode log 的
  `providerID/modelID/url/request_id` 对齐结果。
- 如需进一步验证上游身份，可构造不带 OpenCode system prompt 的最小 curl 请求直打
  proxy，并比较 direct DashScope 与 proxy 响应。
