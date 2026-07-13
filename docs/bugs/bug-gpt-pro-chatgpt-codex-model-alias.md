# GPT Pro agent 被 ChatGPT Codex 拒绝

## 现象

使用 `gpt-pro` agent 请求时返回 `Bad Request`，提示 ChatGPT 账户的 Codex
不支持 `gpt-5.6`。

## 根因分析六要素

1. **触发条件**：通过 ChatGPT 账户使用 Codex，并选择配置为 `openai/gpt-5.6-pro` 的 agent。
2. **直接现象**：服务端拒绝请求，错误中的实际模型为无后缀 `gpt-5.6`。
3. **期望链路**：GPT Pro agent 应使用已验证可用的 Sol 基础模型，并开启 Pro 模式与 `xhigh` effort。
4. **实际链路**：OpenCode 的 `gpt-5.6-pro` 元数据把 API model 映射为 `gpt-5.6`，而非 `gpt-5.6-sol`。
5. **根本原因**：agent 选择了无后缀 Pro 别名；该别名的 API 映射不兼容 ChatGPT Codex 账户。
6. **修复与验证**：改用 `openai/gpt-5.6-sol-pro`；同账户执行 `xhigh` 最小请求并确认返回 `OK`。

## 验证证据

- `openai/gpt-5.6-pro`：稳定复现服务端 400。
- `openai/gpt-5.6-sol-pro --variant xhigh`：成功返回 `OK`。
