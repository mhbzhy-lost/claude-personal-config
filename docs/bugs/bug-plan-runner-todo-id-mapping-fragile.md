# bug: plan-runner 依赖 todo 文本编号导致真实流程卡在 waiting_for_todo

## 现象

真实 `plan-runner` full-flow smoke 中，agent 已调用 `write_plan` 生成任务，但后续 `todowrite` 的 todo 文本未包含 `T1` / `T2` 等 harness 任务编号。harness 多次收到 `todo.updated`，但事件记录为 `mirrored=false`，只能继续等待 agent 自行纠正；当前状态和事件缺少明确可执行诊断，难以让 agent 立即知道必须把 todo 改成 `Tn:` 格式。

## 根因 (6 要素)

1. **触发条件**：`todowrite` todo 文本没有显式包含 `write_plan` 生成的 `Tn` 编号。
2. **期望链路**：harness 能把 OpenCode todo 状态映射回 plan task，确认 agent 已建立与计划一致的执行账本。
3. **实际链路**：harness 只能从 todo `content` 中解析 `Tn`，解析不到时无法判断 todo 对应哪个 plan task，只能记录 `mirrored=false` 并等待下一次 todo 更新。
4. **关键假设失效**：曾假设 `todowrite` 或 `todo.updated` 暴露 per-todo 稳定 id；实际 OpenCode `Todo.Info` 只有 `content/status/priority`，`todo.updated.id` 是事件级 id，不是 todo 级 id。
5. **旁证**：OpenCode schema `packages/schema/src/session-todo.ts` 定义 todo 仅含 `content/status/priority`；表结构 `packages/core/src/session/sql.ts` 以 `(session_id, position)` 为主键；实现 `packages/opencode/src/session/todo.ts` 更新时先删除 session 下所有 todo，再按 position 重插，也没有可跨更新保留的 todo id。
6. **影响范围**：任何未按协议把 `Tn` 写入 todo 文本的真实 plan-runner 任务都会停在 todo mirror 等待阶段，直到 agent 碰巧自行纠正；仅靠数据库或事件 id 不能补救，因为不存在稳定 per-todo id。

## 修复方向

短期应把 `Tn` 文本编号作为明确协议：agent 指令必须要求每条 `todowrite` todo 使用 `Tn: ...` 前缀；harness 在 `mirrored=false` 时给出可执行的 repair/阻断信息，说明必须重写 todo 为 `Tn:` 格式，而不是静默无限等待。

## 验证

- RED：构造 plan task 已写入但 `todo.updated` 内容不含 `Tn` 的场景，旧 harness 只停留在 `waiting_for_todo` 且缺少明确修复提示。
- GREEN：同一场景下 harness 产生明确诊断，指出 todo 必须包含 `Tn:` 前缀；包含 `Tn:` 的 todo 仍能正常 mirror。
