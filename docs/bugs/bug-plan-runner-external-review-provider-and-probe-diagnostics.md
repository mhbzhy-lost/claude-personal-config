# plan-runner external review provider and probe diagnostics

## 现象

plan-runner external review 使用 `idealab-anthropic` 时失败，接口返回 `400 IRC-001`，提示 Team API AKmonth 消费金额已达上限。改用可用 provider 后，外源评审指出 audit-child probe summary 丢失 sqlite3 错误、CLI 参数缺值会静默误解析，以及 audit-child DB 读取路径不尊重 `XDG_DATA_HOME`。

## 影响

- external review 默认 provider 配额耗尽时，直接 CLI 调用不会自动 fallback，导致评审阶段失败。
- audit-child probe 在 `sqlite3` 缺失、DB 锁定或损坏时，summary 只显示 DB 计数为 0，不能区分“无数据”和“读取失败”。
- probe CLI 参数缺值时可能吞掉后续 flag 或写入 `undefined`，增加排查成本。
- 在设置 `XDG_DATA_HOME` 的环境中，audit-child probe 仍读取 `HOME/.local/share/opencode/opencode.db`，可能把真实 child session 误报为 DB 计数为 0。

## 复现

1. 使用配额耗尽的 `idealab-anthropic` 运行 external review，可得到 `IRC-001` 响应。
2. 调用 `summarizeAuditChildProbe({ dbRows: { error: "spawnSync sqlite3 ENOENT" } })`，当前 summary 的 `db` 对象不包含 error。
3. 调用 probe CLI/parser 时传入 `--mode` 但不传值，当前解析不会显式报错。
4. 在 `XDG_DATA_HOME=/tmp/xdg-data` 下运行 audit-child probe，OpenCode DB 应位于 `/tmp/xdg-data/opencode/opencode.db`，但当前读取固定 fallback 路径。

## 根因

- external-review 直接 CLI 单 provider 失败即退出，不具备 push hook 那样的 provider fallback。
- `summarizeAuditChildProbe()` 只拷贝 `session/message/part/session_input` 计数字段，没有传播 `dbRows.error`。
- `parseArgs()` 对 `--mode`、`--root`、`--model`、`--timeout-ms`、`--port`、`--audit-agent` 使用 `argv[++i]`，缺少“下一个 token 必须存在且不是另一个 flag”的边界校验。
- `readAuditChildDbRows()` 的默认 DB 路径硬编码为 `HOME/.local/share/opencode/opencode.db`，没有按 OpenCode/XDG 数据目录优先级解析。

## 修复方案

- plan-runner harness 默认 external review 失败时，按 provider chain 改用可用 provider 重新执行同一轮评审；显式配置 `EXTERNAL_LLM_REVIEW_PROVIDER` 时只用该 provider，显式配置 `OPENCODE_PLAN_RUNNER_EXTERNAL_REVIEW_PROVIDERS` 时按该链路执行。
- 在 audit-child summary 的 `db` 对象中显式输出 `error: dbRows.error || null`。
- 为需要值的 CLI 参数增加统一取值函数，缺值时抛出可诊断错误。
- audit-child DB 默认路径解析优先使用 `XDG_DATA_HOME/opencode/opencode.db`，未设置时回退到 `HOME/.local/share/opencode/opencode.db`。

## 验证

- 先写回归测试覆盖 `db.error` 传播和缺值参数报错，确认 RED。
- 先写回归测试覆盖 `XDG_DATA_HOME` DB 路径优先级，确认 RED。
- 修复后运行定向 node test 与 `git diff --check`。
- 2026-06-30 补充 RED/GREEN：`idealab-anthropic` 模拟失败、`idealab-openai` 模拟通过时，harness 应按同一 review round 重试并最终 `validated`。
- `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`：新增 fallback 用例通过。

## 预防

- 后续直接运行 external review 时，如 provider 返回配额/权限类错误，优先切换已配置 provider，而不是修改业务代码。
- probe summary 中对外部依赖读取失败应保留错误字段，避免把“读取失败”压缩成“数据为空”。
