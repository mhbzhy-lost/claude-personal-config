# OpenCode primary agent 权限未从 SSOT 同步

## 现象

GPT agent 报告没有 `start_plan_runner` 工具；`opencode debug agent GPT` 显示该工具为
`false`，而 `userconf/agents.json` 明确配置为 allow。

## 根因分析六要素

1. **触发条件**：live `opencode.json` 已存在同名 primary agent，随后 SSOT 新增或调整 agent permission。
2. **直接现象**：初始化输出“已是最新”，但 live agent permission 仍为空，全局 deny 生效。
3. **期望链路**：保留用户本地 model 选择，同时同步仓库托管的 prompt 和 permission 契约。
4. **实际链路**：同步器只刷新 executor 全段和普通 agent 的 prompt，不比较 permission。
5. **根本原因**：为保护本地 model 选择而采用的谨慎合并范围过窄，遗漏工具权限字段。
6. **修复与验证**：普通 agent 精确同步 SSOT permission、保留现有 model；debug 输出必须显示 `start_plan_runner: true`。

## 风险边界

不整段覆盖 primary agent，不改变用户本地 model；只同步 SSOT 显式声明的 permission。
