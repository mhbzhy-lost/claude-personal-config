# 项目记忆

本仓的已知陷阱、过往 bug 记录于 [memory.md](memory.md)，动手前先查阅。

# Superpowers 流程增强

## 1. 反幻觉：每阶段强制知识检索

- `brainstorming` 与 `writing-plans` 阶段必须调用 `/knowledge-retrieval`
  （前者侧重选型与架构，后者侧重落地模式与 task 拆分参考）。
- 每个 implementer subagent 动手前必须自己跑 `/knowledge-retrieval`
  检索其 task 涉及的技术域；该约束写入 dispatch prompt，由子代理执行，
  主 agent 不代办。

## 2. 可并发：DAG 拓扑而非串行

- `writing-plans` 必须对子任务做 DAG 依赖分析，明确执行顺序与并发可行集合。
- `subagent-driven-development` 按 DAG 编排：独立 task 并行派发，每个
  task 内部仍走 skill 规定的完整流程。
- 并发 task 在独立 git worktree 中隔离：
  - 主 agent 留在协调层，**不调用 `using-git-worktrees` skill**（其设计
    是把当前 agent 移入 worktree，与协调语义冲突），改为直接
    `git worktree add` 一次性建好所有 worktree。绕过 skill 时主 agent
    须自行履行其安全契约：
    - **目录优先级**：`.worktrees/`（已存在则复用）> `worktrees/` >
      默认新建 `.worktrees/`
    - **`.gitignore` 校验**：首次 add 前一次性确保 worktree 目录已被忽略，
      未忽略则 add+commit；后续并发 add 不重复校验，避免竞态
    - **Submodule guard**：若 cwd 在子模块内，先 `cd` 到 superproject
      root 再建
    - **Sandbox 降级**：`git worktree add` 因权限拒绝失败时整批回退到
      串行执行（在原工作目录顺序跑 task），并提示用户
  - 路径写入各 subagent prompt；subagent 在已就绪的 worktree 内执行任务，
    `using-git-worktrees` skill 自动识别"已在 worktree"并跳过创建段，
    setup 与 baseline 由 skill 标准步骤完成。
  - 并发结束后合并工作树；自动合并失败的冲突提请用户决策。

## 3. 不阻塞：subagent 后台执行

- 所有 subagent 统一后台运行，主对话保持响应。
- 依赖未满足的 task 须等前驱完成后再派发；不因后台模式而提前并发破坏依赖序。

## 4. 完整性：终态校验 + 工作树干净

- 工作流完成后对照 `writing-plans` 产出逐项核实，确保无遗漏或错位。
- 存在未提交变更须完成一次提交。
