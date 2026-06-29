# Plan-runner 重启烟测

## 目的

验证重启后的 OpenCode 已加载当前仓库的 plan-runner plugin、agent 与 skill 栈，能走通：写计划、同步 todo、执行最小改动、运行验证、进入 review loop。

## 步骤

1. 重启 OpenCode，并在本仓根目录启动会话。
2. 在主会话派发一个小型 `plan-runner` 文档任务，要求：
   - 先调用 `write_plan`；
   - 用 `todowrite` 镜像计划项；
   - 只改动约定的文档文件；
   - 至少运行文档相关检查和 `git diff --check`；
   - 不提交、不推送。
3. 等待 plan-runner 返回最终报告。

## 通过标准

- `docs/plans/<task_id>.md` 已生成，且任务状态与 todo 项对应。
- 最终报告列出修改文件、验证命令与结果。
- `git diff --check` 通过。
- review loop 可观察到 self-check 后继续进入审计阶段；若检查 task state，应看到 `audit_review_dispatched` 事件。

## 失败处理

- 若没有 `write_plan` 或 `todowrite` 证据，说明新 agent/skill 指令未生效，先确认 OpenCode 已重启。
- 若停在 self-check 或 deterministic check 后，检查 plan-runner harness 插件是否加载。
