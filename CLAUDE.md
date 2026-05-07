# Superpowers 流程增强

工作流四点补强（语义边界，不绑定 Superpowers 内部步骤命名）：

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

# Executable skills 调用约定

`mcp/skill-catalog` 通过 SKILL.md 的 `execution_mode` 字段区分两类
skill：

- `knowledge`（默认）—— 纯文档型，正常按 markdown 阅读。
- `executable_sandbox` —— 工具型，附带 `install.sh / run-impl.sh /
  runner.sh / _meta.json`，需在 docker sandbox 内调用。

调用此类 skill 时统一入口：

```bash
bash <skills-base>/<tech>/<skill>/runner.sh <args>
```

`runner.sh` 自带：
- 共享 docker 容器（`claude-skill-sandbox`）懒创建（首次 ~10–30s）
- 工具懒装入（首次 ~30–120s，按工具体量）
- 二次调用幂等（< 2s，由 `install.sh` 顶部 idempotent guard 命中）
- `$PWD` 在 `$HOME` 内时直接 bind-mount 翻译；否则走 `docker cp` 落回
  宿主机
- 宿主机 HTTP proxy 透传（`127.0.0.1` 自动改写为
  `host.docker.internal`）

不要直接 `bash install.sh` 或绕开 runner.sh 调用 `run-impl.sh`，会
丢失容器/路径/proxy 包装。

管理命令：

```bash
bin/claude-skill-sandbox status        # 容器状态 + drift 警告
bin/claude-skill-sandbox shell         # 进容器调试
bin/claude-skill-sandbox validate <s>  # 重跑 4 关验证
bin/claude-skill-sandbox reset         # 推倒 sandbox 容器+volume
```

前置依赖：docker daemon 必须可达（`init_claude.sh` 已加 preflight；
macOS 推荐 colima，启动时 `colima start --memory 4` 防 apt 大包 OOM）。

更深入的内部约束、4 关验证流程与已知 caveat 见 `distill/README.md`。
