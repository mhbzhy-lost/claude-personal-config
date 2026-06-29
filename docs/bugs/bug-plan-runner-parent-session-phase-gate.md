# bug: plan-runner 父会话被 phase gate 误拦截

## 现象

后台 `plan-runner` smoke task 完成后，主会话执行 `git status` / `git diff` 被拦截：`plan-runner phase gate: exactly one in_progress todo is required for execution tools`。

## 根因 (6 要素)

1. **触发条件**：主会话派发 `plan-runner` 后，harness 为 parent session 写入 session index，后续主会话执行 bash/edit/write/task。
2. **期望链路**：phase gate 只约束 `plan-runner` child session，父会话仍可独立检查状态、处理后续问题。
3. **实际链路**：`enforcePhaseGate()` 通过 `readTaskStateForSession()` 读取任何绑定 session 的 task state，没有区分 index role；parent role 也被当成 plan-runner session 约束。
4. **关键假设失效**：session index 同时用于 parent、plan-runner、audit 路由，但 phase gate 和 evidence recorder 默认把所有 indexed session 当成执行 session。
5. **旁证**：真实 task state 中 parent session role 存在，主会话 bash 被 self_checking 状态的 todo 规则拦截。
6. **影响范围**：只要 plan-runner task 未进入终态，父会话就可能被阻断，且父会话工具调用还可能污染 plan-runner evidence/todo state。

## 修复方向

让 phase gate、todo 更新和 evidence 记录只消费 role 为 `plan-runner` 的 session；parent 和 audit session 仅用于路由/索引，不参与执行阶段约束。

## 验证

- RED：parent session dispatch 后执行 bash 不应被 phase gate 拦截，当前会抛错。
- GREEN：role 过滤后 parent bash 放行，plan-runner child session 仍受 phase gate 约束。
