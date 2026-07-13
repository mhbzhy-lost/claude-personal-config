# OpenCode agent 大小写迁移遗留配置

## 现象

`userconf/agents.json` 将 `gpt`、`gpt-pro` 更名为 `GPT`、`GPT-Pro` 后，已安装环境再次运行 `sync_opencode_json` 会同时保留新旧四个 agent 键。

## 影响

旧配置可能继续被用户或工具选中，导致同一角色的模型、本地设置和受管 prompt/permission 出现分叉。

## 复现条件

已有 `opencode.json.agent.gpt` 或 `opencode.json.agent["gpt-pro"]`，随后升级到使用新大小写 SSOT 的版本并运行常规同步。

## 根因

同步逻辑仅遍历当前 SSOT 的 agent 名称并合并同名项；旧名称不在 SSOT 中，因此既不会迁移到新名称，也不会被删除。

## 修复方案

在 agent 合并前维护显式映射 `gpt -> GPT`、`gpt-pro -> GPT-Pro`：仅有旧键时移动旧配置，双键同时存在时保留新键并删除旧键，再执行现有 SSOT 刷新逻辑。

## 验证方式

增加 only-old 和 both-present 回归测试，验证本地 model 等非托管字段保留、新名称优先、旧键删除及迁移日志；运行 focused 与完整 `init-opencode-agents` 测试。
