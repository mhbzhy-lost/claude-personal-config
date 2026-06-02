# Bug: OpenCode Claude Opus provider 在 proxy upstream fetch 卡住 10 分钟

状态：本次提交先修复 OpenCode 上下文膨胀与 Superpowers 加载策略，proxy upstream
timeout 仍待用户确认后在 `vendor/opencode-cache-proxy` 子模块内单独修复。

## 现象

用户在 OpenCode 中选择 `anthropic-idealab-cached` 的 Claude Opus 4.6 provider
后，发送消息一直卡住，看起来“发不出去”。

实际 OpenCode 日志显示请求已经进入 LLM streaming 阶段：

```text
service=llm providerID=anthropic-idealab-cached modelID=claude-opus-4-6-300k ... stream
service=session.status ... {"type":"busy"}
```

但 UI 长时间无响应。

## 根因 (6 要素)

1. **触发条件**：OpenCode 使用 `anthropic-idealab-cached/claude-opus-4-6-300k`
   发送大上下文流式请求；本次上下文估算约 137k tokens。
2. **期望链路**：proxy 向 Idealab upstream 发请求。如果 upstream 连接或响应长时间
   stall，proxy 应在合理时间内失败并把错误返回给 OpenCode。
3. **实际链路**：`proxy/src/anthropic-handler.mjs` 直接 `await fetch(upstreamUrl, ...)`，
   没有 `AbortController` 或显式超时；本次请求在 proxy 内等待约 600 秒后才记录
   `502 fetch failed`。
4. **关键假设失效**：代码假设 upstream fetch 会及时成功或失败。但 Node/undici 在
   网络或 upstream stall 时可能长时间悬挂，OpenCode UI 在此期间一直保持 busy。
5. **旁证**：
   - `~/.cache/bailian-cache-proxy/usage.jsonl` 出现记录：
     `model=claude-opus-4-6-300k status=502 duration_ms=600480 proxy_error="fetch failed"`。
   - 同一 proxy、同一 OpenCode auth key、同一 Idealab base URL 的最小非流式请求
     直连测试返回 `status 200`，说明凭据、proxy 路由、Idealab 基本连通性可用。
   - OpenCode 日志在 LLM stream 开始后没有完成事件，符合等待 upstream fetch 的表现。
6. **实现偏差**：OpenAI-compatible 及 Anthropic proxy handler 都没有请求级超时；
   对交互式 CLI 来说，10 分钟后才 502 不可接受，应由 proxy 层主动设置可配置超时。

## 影响范围

- OpenCode 通过 `anthropic-idealab-cached` 使用 Claude Opus 4.6，尤其是大上下文
  stream 请求。
- 任何 upstream 偶发 stall 或长时间无首包响应的场景。
- 用户会误判为 OpenCode 没发送消息；实际请求已发到 proxy，proxy 长时间等待 upstream。

## 修复原则

- 在 `proxy/src/anthropic-handler.mjs` 的 upstream `fetch` 增加显式超时，默认建议
  60 秒或 120 秒，可通过环境变量配置。
- timeout 时记录明确 `proxy_error`，例如 `upstream_timeout`，并尽快返回 504/502。
- 不改变正常成功路径、cache marker planning、usage extraction。
- 补回归测试：构造永不 resolve 的 fetch，确认 handler 在短 timeout 后返回错误并
  写入 usage record。

## 临时规避

- 使用较小上下文的新会话或非 `300k` variant 可降低触发概率。
- 如果只是确认 provider 是否可用，最小请求已验证 proxy + Idealab + auth 是通的；
  当前问题不是凭据失效。

## 待确认

是否按上述原则修复 `vendor/opencode-cache-proxy/proxy/src/anthropic-handler.mjs` 并补
TDD 回归测试。当前子模块已有未提交改动，修复前需要先确认是否允许我在该子模块内
叠加修改。

## 追加发现：Claude Code 兼容加载导致首轮上下文异常膨胀

用户反馈“新会话只发送一句 `快速获取当前项目状态` 也失败”，不符合正常 agentic
coding tool 的首轮上下文规模。复核 OpenCode DB 后确认该 session 只有 2 条
message、1 条 part，不是历史会话未清理。

根因补充：

1. **触发条件**：OpenCode 默认启用 Claude Code 兼容加载，同时本机存在
   `~/.claude/CLAUDE.md`、`~/.claude/skills/`、`~/.agents/skills/` 与
   `vendor/superpowers/skills/`。
2. **期望链路**：OpenCode 新会话只加载 OpenCode 必要规则、项目 `AGENTS.md`、
   当前可用工具和必要 skill 索引。
3. **实际链路**：OpenCode 首轮请求同时加载 Claude Code fallback 规则和 skill
   来源，日志出现多条 duplicate skill warning；失败请求中还可见 skill 清单既出现在
   system 规则，又出现在 `skill` tool schema。
4. **关键假设失效**：本仓把 Claude Code、Codex、OpenCode 配置集中维护，但
   OpenCode 没有必要在默认路径继续读取 Claude Code 全局规则和 skills；该兼容加载
   在本机配置下会把首轮上下文推到远超预期的规模。
5. **旁证**：设置 `OPENCODE_DISABLE_CLAUDE_CODE=1` 后，同一目录下最小请求
   `Reply with exactly OK.` 成功返回；proxy 诊断为 `message_count=1`、
   `total_estimated_tokens=6167`，不再出现 100k+ 级上下文。
6. **实现偏差**：`init_opencode.sh` 当前只注册 `CLAUDE_CONFIG_HOME`，没有注册
   OpenCode 官方提供的 Claude Code 兼容关闭开关；重跑初始化后仍会保留默认兼容加载。

修复原则补充：在 `init_opencode.sh` 的 shell 环境注册阶段追加
`OPENCODE_DISABLE_CLAUDE_CODE=1`，让 OpenCode 默认不读取 Claude Code 相关位置；
保留 OpenCode 原生 `AGENTS.md`、native skill tool、MCP 与 plugin 机制。
