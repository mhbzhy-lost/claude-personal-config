---
title: Plan-Runner 子会话 TUI 实时观察方案
kind: decision
status: proposed
applies_to:
  - userconf/plugins/plan-runner-harness.js
  - userconf/skills/plan-runner-dispatch/SKILL.md
  - OpenCode TUI
last_verified: 2026-07-13
source: https://github.com/anomalyco/opencode/issues/21018
---

# 通过通用子会话元数据补齐 Plan-Runner 的 TUI 实时观察能力

## 背景

`start_plan_runner` 负责在 harness 管理的独立 git worktree 中启动 plan-runner
子会话。该入口不仅是一次普通 agent 派发，还承担运行目录隔离、task-state 初始化、
父子 session 绑定、计划阶段门禁、审查和最终合并提示等职责。

这些能力要求 plan-runner 子会话从专属 worktree 启动，因此不能简单替换为原生
`task` tool。原生 `task` 的优势则在展示层：OpenCode TUI 能把它渲染为可点击的
subagent 卡片，用户可以进入子会话观察实时输出。

当前 `start_plan_runner` 是普通 plugin tool。它启动的子会话本身会产生流式事件，
但父会话中的工具卡片没有稳定的子会话入口，也不会展示或跳转到子会话的实时进度。
用户通常只能等待工具结束，无法从启动位置持续观察执行过程。

## 问题边界

需要解决的是“子会话发现和导航”问题，而不是重新实现流式传输：

- plan-runner 子会话已经存在，并由 OpenCode 保存消息和工具调用。
- 缺失的是 plugin tool 到 child session 的通用展示契约。
- TUI 不应根据 tool 名称判断它是否代表子会话。
- harness 的 worktree、状态机和质量门禁不应为了适配 TUI 而退化。

## 不建议的方案

### 同名覆盖原生 `task`

插件覆盖 `task` 后没有公开接口调用被覆盖的原生实现。为了保留普通 task 行为，
需要复制权限、后台任务、恢复、通知和 metadata 等官方逻辑，后续还会随 OpenCode
升级持续漂移。

### 仅使用 `tool.execute.before/after`

hook 可以创建状态、改写 prompt 和读取原生 task 返回的 session ID，但不能无损改变
原生 TaskTool 使用的 session runtime 目录，也难以保证在子会话开始执行前完成 harness
绑定。通过逐个改写文件路径模拟 worktree 隔离，会让系统工作目录、其他插件和实际工具
路径产生不同认知。

### 在父工具卡片中复制子会话输出

把 child session 的消息重复写入 `start_plan_runner` 输出会造成双份历史、输出膨胀、
状态同步复杂和交互能力缺失。TUI 应导航到原始子会话，而不是制造一个只读副本。

## 建议解决方案

向 OpenCode 提交通用的“tool 关联子会话”展示能力，使展示语义与具体 tool 名解耦。

plugin tool 返回标准化 metadata，表达该工具启动或管理了一个 child session。例如：

```json
{
  "sessionId": "ses_xxx",
  "ui": {
    "kind": "subagent",
    "title": "Plan-Runner"
  }
}
```

OpenCode TUI 的通用工具渲染器识别该契约后：

- 工具运行期间显示明确的运行状态。
- 有效 `sessionId` 出现后，工具卡片变为可点击。
- 点击后进入对应 child session，复用 OpenCode 已有的 session 事件流观察实时输出。
- 工具完成后仍保留导航入口，便于回看执行记录。
- 没有该 metadata 的普通 plugin tool 继续使用现有通用展示，不改变兼容行为。

首期只需提供 metadata 驱动的通用导航，不要求开放任意 TUI 组件注册。长期如果插件需要
自定义进度条、操作按钮或复杂布局，再考虑增加正式的 tool renderer/slot 扩展 API。

## 选择该方案的原因

- 保留 `start_plan_runner` 当前的专属 worktree 和 harness 状态机。
- 不复制或覆盖原生 TaskTool，实现边界稳定。
- 不只服务 Plan-Runner，任何创建 child session 的 plugin tool 都可复用。
- TUI 直接展示原始 child session，天然获得流式消息、工具调用和历史回看能力。
- 改动属于展示层通用能力，不需要 OpenCode 理解 Plan-Runner 的业务语义。

## 上游推进建议

现有 OpenCode issue `#21018` 已描述 plugin tool 缺少 TUI renderer 扩展的问题，但该
issue 因重复和模板合规原因关闭，并不代表功能已经实现。相关 metadata 保留问题已有
修复，而“非 task tool 根据 child session metadata 提供导航”仍缺少明确实现。

推进时应把范围控制在通用能力：

- 复用或重新提交符合模板的 feature issue，并引用 `#21018`。
- 优先提出 metadata-aware GenericTool，而不是硬编码 `start_plan_runner`。
- 将完整 renderer 插件 API 作为后续能力，避免首个改动范围过大。
- 验证原生 task、普通 plugin tool 和带 child session 的 plugin tool 三条路径。

## 临时方案

在上游能力可用前，可以维护 OpenCode 本地补丁，让 GenericTool 在发现有效 child session
metadata 时提供导航。该方案只适合短期验证，需要承担版本升级后的补丁维护成本。

不建议为了临时 TUI 体验修改 Plan-Runner 的执行架构或取消独立 worktree。

## 验收标准

- 调用 `start_plan_runner` 后，父会话立即显示运行中的 Plan-Runner 工具卡片。
- child session ID 可用后，无需等待计划完成即可点击进入。
- 进入 child session 后能持续看到新增消息和工具调用。
- 返回父会话后仍可再次进入同一 child session。
- 完成、失败和取消状态均保留正确导航目标。
- 原生 `task` 的展示、后台执行和点击行为不发生回归。
- 不带 child session metadata 的 plugin tool 展示保持不变。

## 相关资料

- [OpenCode #21018: TUI plugin tool rendering extension](https://github.com/anomalyco/opencode/issues/21018)
- [OpenCode #18585: Plugin tool metadata title in TUI](https://github.com/anomalyco/opencode/issues/18585)
- [OpenCode PR #22827: Preserve plugin tool metadata](https://github.com/anomalyco/opencode/pull/22827)
- `docs/knowledge/subagent-dispatch-hook.md`
- `userconf/plugins/plan-runner-harness.js`
