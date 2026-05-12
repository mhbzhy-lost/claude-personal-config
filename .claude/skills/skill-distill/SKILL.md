---
name: skill-distill
description: 把官方文档自动蒸馏成 SKILL.md，落到指定 skill 库。可选附加 install.sh + runner.sh 让 skill 在 docker sandbox 内可执行。
capability: [knowledge-distillation, agent-orchestration]
tech_stack: [claude-code]
language: [python]
---

# What

蒸馏官方文档生成 SKILL.md，落到 `<skills_base>/<tech_stack>/<skill>/`。

`--intent` 指定 `execution_mode: executable_sandbox` 时，额外产出
`install.sh` / `run-impl.sh` / `runner.sh` / `_meta.json`，整套
skill 可在 `claude-skill-sandbox` docker 容器内 `bash runner.sh <args>` 运行。

# When to Use

- 用户要求"为 X 创建 / 更新 skill"
- `mcp__skill-catalog__resolve` 检索后发现知识库缺某领域
- 主 agent 自评对 X 不熟主动补充

# How

## 1. 调用前置（必须做完才调）

**a. 确认 `~/claude-config/distill/.env`** 存在且配了 `DISTILL_PROVIDER` + 对应 API key（`DEEPSEEK_API_KEY` 或 `DASHSCOPE_API_KEY`）。

缺失则提示用户配 `.env`，**不要**自己写 secrets。

**b. 确认 `--skills-base` 路径**：

| 选项 | 路径 |
|---|---|
| 推荐 | `~/claude-config/skills/`（mcp/skill-catalog 索引此处）|
| 项目级 | `<project>/.claude/skills/` |
| 自定义 | 用户指定 |

不能从上下文推断时**先问用户**，不要擅自调用。

## 2. 调用

```bash
cd ~/claude-config/distill && uv run skill-distill \
  --intent "<自然语言意图>" \
  --skills-base ~/claude-config/skills \
  [--max-skills N]    # testing only
```

`--intent` 唯一必填，可包含：

- 聚焦：`重点 Form/Input/Select`
- 排除：`跳过 Calendar/Charts`
- 粒度：`每个组件独立一个 skill`
- 规模：`每个 SKILL.md 控制在 5KB 内`
- 可执行：`execution_mode 必须设为 executable_sandbox` + 描述 install.sh 该装什么、smoke 怎么验

## 3. 调用后：检查 verified 决定是否兜底

蒸馏 executable_sandbox 类 skill 后，读 `<skill>/_meta.json`：

| `assets.install.sh.verified` | 主 agent 动作 |
|---|---|
| `true` | 完成 |
| `false`（含 `abort_reason: budget_exhausted`）| 接手修 install.sh / run-impl.sh，跑 `bash <skill>/runner.sh <smoke>` 验证通过后改 `_meta.json` 为 `verified: true, verification_method: main_agent_post_fix, note: <差异>` |

不要抬 budget 重跑——agentic budget（10 bash + 3 finalize）覆盖大多数情形，剩余的由主 agent 在 sandbox 里直接调。

# Examples

```bash
--intent "蒸馏 httpx"
--intent "为 antd 蒸馏表单组件 skill：重点 Form/Input/Select/DatePicker"
--intent "为 react-query 蒸馏 5 个细粒度 skill：useQuery/useMutation/Suspense/Persistence/DevTools"
--intent "为 mitmproxy 蒸馏 executable_sandbox skill：装 mitmproxy + ca-certificates；smoke: mitmdump --version"
```

# Caveats

- `--intent` 缺失/空 → argparse 直接 reject
- `--max-skills` 仅 testing 用，生产不传
- plan 阶段需网络（`list_skills` + `web_search` + `web_fetch`）
- `<skills_base>/_tag_catalog.json` 是标签闭集；新 key 蒸馏后会 auto-append（description=null），主 agent 后续可补 description
- 蒸馏到 `~/claude-config/skills/` 后跑一次 `mcp__skill-catalog__resolve` 确认能被检索命中
- 深度细节（4 关验证 / agentic loop / batch 启发式 / provider 对比）见 `~/claude-config/distill/README.md`
