# bug: plan-runner write_plan 未拒绝有环 DAG

## 症状

`write_plan` 接收 `dag` 参数时，只校验每条边的两端 task id 是否存在，没有检查依赖图是否有环。

## 影响

如果计划包含 `T1 -> T2`、`T2 -> T1` 这类循环依赖，后续调度或审计阶段无法得到有效执行顺序，可能卡住或不断要求修复。

## 期望行为

`write_plan` 应拒绝有环 DAG，并给出明确错误信息。

## 实际行为

`validateDag` 仅校验边形状和 task id 是否存在，有环 DAG 会通过校验。

## 根因

首个最小切片只落地了引用完整性校验，没有实现拓扑合法性校验。

## 修复方案

在 `validateDag` 中基于 DFS 检测环，发现回边时抛出 `dag contains a cycle`。

## 验证

单测构造 `T1 -> T2 -> T1`，确认 `write_plan` 拒绝该 DAG。
