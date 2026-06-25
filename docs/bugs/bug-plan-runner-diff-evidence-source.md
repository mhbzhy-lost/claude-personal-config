# bug: plan-runner 未从真实 diff 事件源记录 diff evidence

## 症状

真实 git workspace 闭环中，`plan-runner` 已完成以下动作：

- `write_plan` 成功写入 workspace 下的 `docs/plans/<task_id>.md`
- `todowrite` 成功 mirror `T1`
- `write` 成功创建 `probe-output.txt`
- bash/read 验证通过
- todo 标记为 completed

但 harness 没有记录 `type: "diff"` evidence，`session.idle` 后提示 `T1 has no diff evidence`，两轮后状态变成 `blocked`。

## 影响

- 真实任务即使产生文件 diff，也会被 deterministic check 判失败。
- repair prompt 会要求 agent 补 diff evidence，但 phase gate 在 completed todo 后要求唯一 in_progress，容易进入无效修复循环。

## 期望行为

文件变更后，harness 应把真实 diff payload 记录为当前 active task 的 diff evidence，并更新 `modified_files`。

## 实际行为

真实日志显示：

```text
Event: session.diff | {"sessionID":"...","diff":[]}
```

同时真实 diff 出现在：

```text
Event: message.updated | {"info":{"summary":{"diffs":[{"file":"probe-output.txt", ...}]}}}
```

以及写文件后出现 patch part：

```text
Event: message.part.updated | {"part":{"type":"patch","files":[".../probe-output.txt"]}}
```

## 根因

harness 只监听 `session.diff`：

```js
handleSessionDiff(stateDir, event)
```

但 OpenCode 1.17.10 在真实运行中把可用 diff 放在 `message.updated.info.summary.diffs`，`session.diff.diff` 始终为空。数据源假设错误导致 evidence 漏记。

## 修复方案

新增 `message.updated.info.summary.diffs` recorder，并复用现有 active todo 映射逻辑记录 `type: "diff"` evidence。`message.part.updated` 的 patch part 可作为 fallback。

## 验证

- 单测：`message.updated.info.summary.diffs` 能写入 diff evidence 和 `modified_files`。
- 真实闭环：临时 git workspace 中创建文件后，state 进入 `audit_review`，不再因缺 diff evidence 进入 repair/blocked。
