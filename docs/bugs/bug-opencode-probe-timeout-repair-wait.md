# bug: opencode probe run 超时后仍等待 repair evidence

## 症状

`opencode run` 因超时被 `spawnSync` 终止后，probe 仍继续等待 `postRunWaitMs` 观察 repair evidence。

## 影响

真实失败已经发生时，脚本会额外等待，拖慢本地验证和 push 前检查反馈。

## 期望行为

如果 run 已经被 signal 或 error 终止，应直接跳过 repair evidence 等待。

## 实际行为

无论 `spawnSync` 结果如何，都会调用 `waitForRepairEvidence`。

## 根因

repair evidence 等待逻辑没有区分正常 run 结束与超时/异常结束。

## 修复方案

新增 `shouldWaitForRepairEvidence`，仅在无 `error` 且无 `signal` 时等待。

## 验证

单测覆盖 signal/error 情况跳过等待；probe 测试全部通过。
