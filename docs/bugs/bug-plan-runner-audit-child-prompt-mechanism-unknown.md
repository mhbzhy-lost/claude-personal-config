# bug: plan-runner audit child prompt 机制未探明导致反复返工

## 现象

post-restart smoke 中，plan-runner 子任务文本返回 `Result: completed`，但 task-state 停在 `interrupted`。events 显示 `self_check_completed` 和 `deterministic_check_passed` 已写入，随后 `audit_dispatch_failed`，错误为 `audit prompt dispatch failed: Unexpected server error. Check server logs for details.` DB 中 audit child session 只存在 `session` 行，没有 `message` 或 `part`。

## 根因 (6 要素)

1. **触发条件**：harness 在 plan-runner completion idle 后创建 audit child session，并调用同步 `client.session.prompt({ body: { agent: "plan-runner-audit", parts: [...] } })`。
2. **期望链路**：audit child 应收到 prompt，DB 落 message/part，并由 `plan-runner-audit` 产出 JSON。legacy `session.prompt` 路径不写 `session_input`。
3. **实际链路**：`session.create` 成功写入 child session，但 `session.prompt` 返回 SDK error；child 没有任何 prompt 入库记录。
4. **关键假设失效**：此前只用单测和部分 serve wrapper 验证了 `promptAsync` 回投、task subagent、以及同步 prompt 表面调用；没有系统性探明“plugin 内 create 新 child + 同步 prompt + custom agent”的最小可用 payload 和失败表现。
5. **旁证**：live smoke task-state 为 `interrupted`，child session `ses_0e855bd96ffeePn2v57H4MzCQ1` role=`audit` status=`orphaned`，DB message/part count 均为 0。
6. **影响范围**：任何依赖 harness 创建并启动 audit child 的终态门禁都会卡住，且因为机制未探明，继续直接改 harness 容易反复返工。

## 调查结论

新增 `audit-child` probe 后得到复现矩阵：

- `body.agent = "probe-audit"`：`session.create` ok，`session.prompt` ok，DB 有 child `session`、`message`、`part`。
- `body.agent = "plan-runner-audit"`（同步前）：`session.create` ok，`session.prompt` 返回 `Unexpected server error`，DB 只有 child `session`。
- server log 同步前的真实错误：`Agent not found: "plan-runner-audit". Available agents: build, explore, general, plan, plan-runner, probe-audit`。
- 运行 `sync_opencode_agents` 创建 `~/.config/opencode/agents/plan-runner-audit.md` 后，新起 probe server 再跑 `body.agent = "plan-runner-audit"`：`session.prompt` ok，DB 有 child `message` 和 `part`。

因此根因不是 `client.session.create + client.session.prompt` 机制不可用，而是当前运行的 OpenCode 进程没有加载 `plan-runner-audit` agent。live smoke 失败时 agent 安装态缺失；同步 agent 后还需要重启 OpenCode，运行中的进程不会热加载 agent 文件。

## 修复方向

先新增轻量 OpenCode 机制探针，独立验证 `client.session.create` + `client.session.prompt` 到新 child session 的行为矩阵，记录 SDK 返回、DB 落库、event 和 server log，再基于探针证据调整 harness。

本次实际修复动作：运行 `sync_opencode_agents`，确保 `plan-runner-audit.md` 被软链到 `~/.config/opencode/agents/`。下一步必须重启 OpenCode 后重跑 live smoke。

## 验证

- RED：probe 单测要求存在 `audit-child` mode 的临时 agent/plugin、summary 字段和 log offset 读取；当前脚本不具备这些能力。
- GREEN：probe 可本地运行并输出 create/prompt/DB/log summary，用于复现 live smoke 的 audit dispatch failure。
