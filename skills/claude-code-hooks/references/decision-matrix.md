# Hooks 决策矩阵

快速回答「我该用哪种 handler / 该怎么输出」。

---

## 选 handler 类型

```
是否需要 LLM 判断？
├── 否 → "command"（默认）
│        └─ 远程团队服务? → "http"
└── 是
    ├── 仅基于 hook input 即可判断 → "prompt"
    └── 需要读文件 / 跑命令验证    → "agent"
```

| 场景                             | 选择    | 原因                        |
| -------------------------------- | ------- | --------------------------- |
| 阻止 `rm -rf`                    | command | 简单字符串匹配              |
| 审计日志写本地文件               | command | shell + jq                  |
| 审计日志写团队服务               | http    | 远程收集                    |
| "任务是否都完成了？"             | prompt  | 需要判断，不需要查代码      |
| "测试是否通过？"                 | agent   | 要运行测试、读结果          |
| 编辑后跑 prettier                | command | 确定性动作                  |

---

## 选退出码 vs JSON

| 需求                           | 方式               |
| ------------------------------ | ------------------ |
| 只想放行                       | `exit 0`           |
| 只想阻断，给 Claude 一句话反馈 | `exit 2` + stderr  |
| 给 Claude 注入上下文           | `exit 0` + stdout 文本（仅 `UserPromptSubmit`, `SessionStart`, `PostToolUse`） |
| 需要精细决策（allow/ask/deny） | `exit 0` + JSON stdout |
| 要改 tool 参数                 | `exit 0` + JSON `updatedInput` |
| 要改权限模式                   | `exit 0` + JSON `updatedPermissions` |

---

## Matcher vs `if` 字段

```
matcher：按"什么事件目标"过滤（事件特定，见 events.md）
if：    用权限规则语法按 tool 参数过滤（更细粒度）
```

| 想过滤的维度                | 用哪个     | 示例                      |
| --------------------------- | ---------- | ------------------------- |
| 工具名（`Bash`、`Edit`）    | matcher    | `"matcher": "Bash"`       |
| 工具名 + 参数（`git *`）    | `if`       | `"if": "Bash(git *)"`     |
| 只对 TypeScript 编辑触发    | `if`       | `"if": "Edit(*.ts)"`      |
| session 启动/压缩           | matcher    | `"matcher": "compact"`    |
| 通知类型                    | matcher    | `"matcher": "idle_prompt"` |
| config 来源                 | matcher    | `"matcher": "project_settings"` |

两者可组合：matcher 先筛事件/工具维度，`if` 再筛参数。

---

## `PreToolUse` permissionDecision 语义

| 值       | 行为                                                                      |
| -------- | ------------------------------------------------------------------------- |
| `allow`  | 跳过权限弹窗；**不能越过 settings 的 deny / managed deny list**           |
| `deny`   | 取消 tool call；**即使 `bypassPermissions` 也生效**，是强制策略的唯一方式 |
| `ask`    | 强制弹窗让用户确认（即使 settings 本该 allow）                            |
| `defer`  | 仅非交互 `-p` 模式：进程退出保留 tool call，Agent SDK 可恢复              |

多 hook 合并规则：**最严格胜出**。任一 `deny` 则 deny；任一 `ask` 则 ask；只有全 `allow` 才 allow。

---

## 可阻断 vs 已发生

| 类别         | 事件                                                                                          | exit 2 含义  |
| ------------ | --------------------------------------------------------------------------------------------- | ------------ |
| **可阻断**   | PreToolUse, PermissionRequest, UserPromptSubmit, Stop, SubagentStop, TeammateIdle, TaskCreated, TaskCompleted, ConfigChange, PreCompact, Elicitation, ElicitationResult, WorktreeCreate | 真阻断       |
| **已发生**   | PostToolUse, PostToolUseFailure, PermissionDenied, StopFailure, Notification, SubagentStart, SessionStart, SessionEnd, CwdChanged, FileChanged, PostCompact, WorktreeRemove, InstructionsLoaded | 仅反馈       |

对"已发生"类，要改变行为只能给 Claude **反馈**（stderr 或 `reason`），让它下一步调整。

---

## 防坑 checklist

- [ ] Stop hook 检查了 `stop_hook_active`？
- [ ] 脚本路径用了 `$CLAUDE_PROJECT_DIR`？
- [ ] 脚本 `chmod +x` 了？
- [ ] shell 启动文件中的 `echo` 是否包了 `[[ $- == *i* ]]`？
- [ ] 非交互模式（`-p`）下是否用 PreToolUse 替代 PermissionRequest？
- [ ] 自动批准类 hook 的 matcher 是否尽量狭窄（避免 `.*`）？
- [ ] 多个 hook 是否同时写同一 tool 的 `updatedInput`？
- [ ] JSON 是否含尾逗号 / 注释？
- [ ] HTTP hook 的 header 变量是否在 `allowedEnvVars` 声明？
