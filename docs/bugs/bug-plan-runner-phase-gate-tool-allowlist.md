# bug: plan-runner phase gate 拦截必要工具

## 现象

真实后台 `plan-runner` smoke task 中，`apply_patch` 被 `ready_to_execute` 阶段拦截，`verification-before-completion` skill 在执行 / self-check 阶段也被拦截，子任务被迫改用 bash 写文件且无法按流程加载验证 skill。

## 根因 (6 要素)

1. **触发条件**：`plan-runner` 子会话进入 `ready_to_execute`、`executing` 或 `self_checking` 后调用 `apply_patch` 或 `skill`。
2. **期望链路**：`apply_patch` 是受当前 in-progress todo 约束的变更工具；`skill` 是加载流程约束的只读工具，应在 planning、todo、execution、自检阶段可用。
3. **实际链路**：`EXECUTION_TOOLS` 不包含 `apply_patch` / `skill`，`PLANNING_TOOLS` 和 `TODO_TOOLS` 也不包含 `skill`。
4. **关键假设失效**：allowlist 把工具面简化为 OpenCode 内建 read/edit/write/bash/task，遗漏了本环境真实使用的 patch 和 skill 工具。
5. **旁证**：真实 message log 中 `apply_patch` 抛出 `not allowed during ready_to_execute`，`skill` 抛出 `not allowed during executing/self_checking`。
6. **影响范围**：plan-runner 无法遵守仓库要求的 apply_patch 编辑方式和 verification-before-completion 流程，降低真实 smoke 的可信度。

## 修复方向

把 `skill` 作为只读上下文工具加入 planning / todo / execution allowlist；把 `apply_patch` 作为变更工具加入 execution allowlist 和 execution-context 工具集合，继续要求 exactly one `in_progress` todo。

## 验证

- RED：执行阶段 `apply_patch` 和 `skill` 当前被 phase gate 拒绝。
- GREEN：`apply_patch` 在恰好一个 in-progress todo 时放行，缺少 active todo 时仍拒绝；`skill` 在执行和 self-check 阶段放行。
