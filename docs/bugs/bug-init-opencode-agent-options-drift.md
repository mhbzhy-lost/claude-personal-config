# bug: init 不会刷新已有 agent 配置项

## 现象

`userconf/agents.json` 已把 `executor` 调整为 `temperature = 0`、`options.effort = low`、`options.reasoningEffort = low`，但重跑 `init_opencode.sh` 前的检查显示 `~/.config/opencode/opencode.json` 仍保留旧的 `high` 配置。

## 根因 (6 要素)

1. **触发条件**：全局 `opencode.json.agent.executor` 已存在，随后仓内 `userconf/agents.json` 调整 executor 配置。
2. **期望链路**：`init_opencode.sh` 应把仓内 SSOT 中 executor 的确定性低推理配置同步到全局 OpenCode 配置。
3. **实际链路**：脚本只在 agent 不存在时新增；已存在且不是禁用 agent 时只比较并更新 `prompt` 字段。
4. **关键假设失效**：早期为避免覆盖用户自定义模型，假设已有 agent 除 `prompt` 外都不应被 init 改写；但 executor 是仓内托管的确定性执行器，`options` 本身就是需要同步的行为契约。
5. **旁证**：当前全局配置中 executor 仍为 `effort=high` / `reasoningEffort=high`；代码路径位于 `init_opencode.sh` 的 agent merge 分支，只处理 `prompt`。
6. **影响范围**：所有已安装过 executor 的机器重跑 init 后仍沿用旧推理预算，导致执行器行为与仓内配置、测试和文档不一致。

## 修复方向

把 `opencode.json` 合并逻辑封装成可单测的 `sync_opencode_json`，并在已有 `executor` 配置存在时按 `userconf/agents.json` 刷新整段 executor 配置；其他非禁用 agent 继续保留现有的谨慎合并策略，避免意外覆盖用户本地模型选择。

## 验证

- RED：新增临时 `opencode.json` 中 executor 为旧 `high` 的测试，要求调用 `sync_opencode_json` 后变为仓内 `low` 配置；旧脚本缺少该库函数并失败。
- GREEN：封装并修复 agent merge 后，`node --test "userconf/plugins/test/init-opencode-agents.test.mjs"` 通过。
- 真实验证：重跑 `bash init_opencode.sh` 后输出 `[agent] executor 配置已更新`，全局 `~/.config/opencode/opencode.json` 中 executor 为 `temperature=0`、`effort=low`、`reasoningEffort=low`。
