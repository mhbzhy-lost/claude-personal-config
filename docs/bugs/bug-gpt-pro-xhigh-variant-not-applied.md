# GPT-Pro 的 xhigh 未成为有效 variant

## 现象

GPT-Pro 配置声明 `reasoningEffort: xhigh`，但 TUI 不显示 xhigh；实际活跃会话在
OpenCode 数据库中记录为 `variant: default`。

## 根因分析六要素

1. **触发条件**：agent 仅在 `options` 中设置 `effort/reasoningEffort`，没有设置顶层 `variant`。
2. **直接现象**：`opencode debug agent GPT-Pro` 只有 options；session model 记录 `variant: default`。
3. **期望链路**：GPT-Pro 选择模型元数据中的 `xhigh` variant，由 OpenCode 注入对应 provider 参数并在 TUI/会话中显示。
4. **实际链路**：OpenCode 的 agent 默认档位来自 `AgentConfig.variant`，普通 `options` 不会把会话档位标记为 xhigh。
5. **根本原因**：把 provider 参数误当成 OpenCode 的 variant 选择器，配置层级写错。
6. **修复与验证**：GPT-Pro 设置 `variant: xhigh`，executor 设置 `variant: none`；移除重复的 reasoning options。新会话必须记录并显示对应 variant。

## 证据

活跃会话 `ses_0bb7dad71ffes4L3jZOxaD8OAe` 使用 `gpt-5.6-sol-pro`，但 model JSON
为 `variant: default`。

同一配置错误也影响 executor：其 `options.reasoningEffort: none` 不会把子会话标记为
`none` variant，因此统一改用顶层 `variant`。
