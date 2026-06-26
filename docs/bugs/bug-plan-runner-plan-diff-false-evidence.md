# bug: plan-runner 把计划文档 diff 误当实现 evidence

## 症状

真实 `plan-runner` 子会话完成后，task state 进入 `audit_review`，但 `modified_files` 只有 `docs/plans/<task_id>.md`，所有 `type: "diff"` evidence 也都指向计划文档。

## 影响

- deterministic check 会把 harness 自己写入的计划文档误判为每个任务的实现 diff evidence。
- 没有真实实现文件证据时仍会进入 `audit_review`，后续审计输入失真。
- 用户看到计划执行完成，但无法从 state 判断实际改了哪些业务文件。

## 期望行为

- `write_plan` 生成的 `docs/plans/<task_id>.md` 只能作为计划文档，不得计入实现 diff evidence。
- `write` / `edit` 工具携带的 `filePath` 应记录为当前 active todo 的 diff evidence。
- 若任务只产生计划文档 diff，没有真实实现文件 evidence，idle validation 应进入 repair prompt。

## 实际行为

OpenCode 1.17.11 的真实事件中，`message.updated.info.summary.diffs` 多次重复输出同一个用户消息的计划文档 diff。harness 每次都按当前 active todo 记录该 diff，导致 T1-T6 都获得了计划文档 evidence。

同时 `write` / `edit` tool part 的 `state.input.filePath` 包含真实实现文件路径，但 harness 只在 `bash` 后记录 command evidence，没有从 `write` / `edit` 记录文件 evidence。

## 根因

上一轮修复把 `message.updated.info.summary.diffs` 作为真实 diff 来源，但没有过滤 harness 自己生成的 `state.plan_path`，也没有处理同一 summary diff 在多个 event 中重复出现的情况。实现文件路径实际存在于 `write` / `edit` 的 tool 输入里，却没有被 recorder 消费。

## 修复方案

- 在 diff evidence recorder 中过滤 `state.plan_path`，避免计划文档成为实现 evidence。
- 在 `tool.execute.after(write|edit)` 中读取 `input.args.filePath`，按当前 active todo 写入 `type: "diff"` evidence 和 `modified_files`。
- 增加回归测试：计划文档 summary diff 不满足 completed todo 的 diff evidence；`write` / `edit` filePath 可以满足。

## 验证

- `node --test userconf/plugins/test/plan-runner-harness.test.mjs`
- `node --check userconf/plugins/plan-runner-harness.js`
