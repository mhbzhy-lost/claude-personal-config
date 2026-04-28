---
name: skill-distill
description: 把任意技术栈/领域的官方文档自动蒸馏成 SKILL.md 知识包，落到主 agent 指定的 skill 库（推荐 claude-config/skills/）。支持自然语言意图（聚焦/排除/粒度/规模约束），多 skill 自动切 batch + cache 友好。
capability: [knowledge-distillation, agent-orchestration]
tech_stack: [claude-code]
language: [python]
---

# Purpose

主 agent 需要为某个技术栈/领域批量产出 SKILL.md 时调用。工具自动：

1. **plan**：单次 LLM 对话——解析意图 + 探索官方文档 + 输出 plan.json（含 tech_stack 推断 / constraints / skills 列表）
2. **fetch**：纯脚本拉取所有 source URL
3. **build**：每个 batch 一次 LLM 对话，三步走（preprocess → SKILL.md → capability tag），同一 system prompt 跨 batch 命中 prefix cache

# When to Use

- 用户要求"为 X 创建 / 更新 skill"
- 检索后发现技术知识库（推荐 `claude-config/skills/`）缺少某领域的知识
- 主 agent 自我评估"我对 X 不够熟"时主动补充
- 需要按聚焦/排除/粒度约束批量补全多个相关 skill

# 初始化（无需手动）

工具走 uv 懒加载——首次 `uv run skill-distill` 时自动：

1. 创建 `.venv/`（如不存在）
2. 按 `pyproject.toml` 同步依赖
3. 后续修改 pyproject 也自动 detect 并补装

**主 agent 不需要预先 `uv sync`**，直接调用即可。

唯一机器级前置：`uv` 命令本身已装（`which uv` 应返回路径，否则参考 https://docs.astral.sh/uv/）。

# 环境配置前置（最高优先级）

调用本工具前**必须确认** `/Users/mhbzhy/claude-config/distill/.env` 文件存在且配置了：

| 必填字段 | 说明 |
|---|---|
| `DISTILL_PROVIDER` | `deepseek` 或 `qwen`，选定本次蒸馏使用的 LLM 厂商 |
| `DEEPSEEK_API_KEY` | 当 provider=deepseek 时必填，从 platform.deepseek.com 获取 |
| `DASHSCOPE_API_KEY` | 当 provider=qwen 时必填，从 dashscope.console.aliyun.com 获取 |

**如果 .env 缺失或字段不全**，主 agent **必须先提示用户**：

> "蒸馏工具需要在 `/Users/mhbzhy/claude-config/distill/.env` 配置 API key。
> 参考同目录的 `.env.example` 复制并填入：
> - 选择 `DISTILL_PROVIDER`（deepseek 或 qwen）
> - 填入对应的 API key
> 配好后再让我重新尝试蒸馏。"

**绝不能**：
- 主 agent 自行写入 / 修改 .env 文件（涉及用户 secrets）
- 主 agent 把 API key 通过 CLI 参数传入（已不支持，且 key 会出现在 process list / 日志）
- 主 agent 用其他人的 key 兜底

# 调用前置：必须告知 skills_base

主 agent 在调用本工具前**必须确定 skill 产出位置**：

- **推荐：技术知识库** `/Users/mhbzhy/claude-config/skills/`（mcp/skill-catalog 索引此处，主 agent 通过 resolve/get_skill 检索的 skill 都在这里）
- **特殊：Claude Code skill 库** `~/.claude/skills/` = `claude-config/claude-skills/`（仅放 slash command / agent helper 类 skill，**蒸馏产出不应放这里**）
- **项目级**：`<project_root>/.claude/skills/`（仅当前项目可见）
- **自定义**：用户指定的其他路径

**如果不能从对话上下文推断出该位置**，主 agent 必须**先向用户提问**：

> "新蒸馏的 skill 要落到哪？
> A. 技术知识库 `/Users/mhbzhy/claude-config/skills/`（推荐：可被 skill-catalog 检索）
> B. 当前项目 `<project>/.claude/skills/`
> C. 自定义路径（请提供）"

**绝不能在没有明确产出位置时擅自调用本工具**——位置一旦写入就难撤回。

调用时通过 `--skills-base <path>` 显式传入（或预先 export `SKILL_LIBRARY_PATH`，工具与 mcp/skill-catalog 共用同一个 env）：

```bash
... --skills-base /Users/mhbzhy/claude-config/skills    # 推荐
... --skills-base /path/to/project/.claude/skills
```

> 不再有隐式默认值。`--skills-base` 缺失且 `SKILL_LIBRARY_PATH` 也未设置时，pipeline 会 hard fail。

# 标签闭集

skill 的 `capability` / `tech_stack` 标签来自 `<skills_base>/_tag_catalog.json` 权威闭集：

- **蒸馏管线**读它注入到 BUILD_PROMPT，强约束 LLM 只能从闭集中选 key
- **mcp/skill-catalog** 也读它作为 `available_tags()` 的数据源
- 蒸馏完成后若产出的 SKILL.md 用了**新 key**（闭集外），管线会**自动 append** 到 json（description 留 `null`），并在 stderr 与 `summary.config.new_tags_appended` 里 warn
- 用户后续可手动给新 key 补 description

闭集 schema：
- `capability`：dict，`{key: "包含/不包含/示例 单行描述"}`
- `tech_stack`：dict，同上
- `language`：plain list

新增 key 时只填 key（value=null）也可，工具可正常工作；description 只是给主 agent / classifier 提供更准的语义提示。

# Invocation

```bash
cd /Users/mhbzhy/claude-config/distill && \
  uv run skill-distill \
    --intent "<自然语言意图>" \
    --skills-base /Users/mhbzhy/claude-config/skills \
    [--max-skills N]      # testing only \
    [--model MODEL_OVERRIDE]
```

`--intent` 是**唯一必填的语义参数**。tech_stack 由 plan 阶段从 intent 推断，不再由用户传入。

**provider 与 API key 不再走 CLI**——从 `distill/.env` 读取（见上方"环境配置前置"段）。这避免 key 出现在 process list / shell history / 日志中。

# Intent 语法

自然语言为主，建议覆盖以下维度（缺省由 plan LLM 自由判断）：

| 维度 | 示例 |
|---|---|
| 目标 | "为 antd 蒸馏..." / "蒸馏 httpx" |
| 聚焦 | "重点 Form/Input/Select" / "重点 RAG 模式" |
| 排除 | "跳过 Calendar/Charts" / "跳过已有的 retriever skill" |
| 粒度 | "每个组件独立一个 skill" / "合并成一个大 skill" |
| 规模 | "每个 SKILL.md 控制在 5KB 内" |

plan 阶段会把这些维度提炼成 `constraints` 数组（如 `focus:form-components` / `skip:antd-table` / `granularity:per-component` / `max_size:5kb`），并保证 skill 列表严格遵守。

# Output

- SKILL.md 落到 `<skills_base>/<plan 推断的 tech_stack>/<skill>/SKILL.md`（推荐 `<skills_base>=/Users/mhbzhy/claude-config/skills`）
- plan.json 落到 `/tmp/skill-src/<tech>/plan.json`，含完整 intent + constraints 审计信息
- summary 落到 `distill/runs/<ts>/summary.json`（含 token / cache hit / 双家对比基础）

# Cost & Latency（DeepSeek 经验值）

- 单 skill：~$0.02 / ~5min
- 4 skills batched：~$0.07 / ~20min
- Qwen 价格更低但 cache 命中率略低

# Provider 选择

- **DeepSeek-V4-Pro**（推荐）：自动缓存命中率 88-94%，单价中等
- **Qwen3.6-max-preview**：显式缓存适配后 80%+，单价更低

# Examples

```bash
# 例 1：简单蒸馏整个库
--intent "蒸馏 httpx"

# 例 2：聚焦子领域
--intent "为 antd 蒸馏表单组件相关 skill，重点 Form/Input/Select/DatePicker"

# 例 3：带排除约束
--intent "为 langchain 蒸馏 RAG 模式相关 skill，跳过已有的 retriever skill"

# 例 4：控制粒度
--intent "为 react-query 蒸馏 5 个细粒度 skill：useQuery / useMutation / Suspense / Persistence / DevTools"

# 例 5：限制规模 + 截断
--intent "蒸馏 lodash 数组 API（map/filter/reduce/groupBy）" --max-skills 1
```

# Caveats

- `--intent` 缺失或为空字符串会被 argparse 直接拒绝
- `build_batch_size` 由 plan LLM 在 plan.json 内自动决定（基于 skill 数量、avg estimated_tokens、context window 容量），主 agent 不需关心，也无 CLI 开关
- `--max-skills` 仅用于 testing/debugging，生产调用不要传
- plan 阶段会调 `list_skills` + `web_search` + `web_fetch`，需要工具网络可达
- tech_stack slug 由 plan LLM 推断后再 normalize 成文件系统安全形式（小写/去空格/连字符化），结果会写到 plan.json 和 summary.json
- 同一 venv 下并行跑多个 distill 任务安全（plan workspace 按 run_id 暂存，确认 tech_stack 后再迁到 `<output_dir>/<tech>/`）

# Composition Hints

- 需要先看现有 skill 是否已覆盖时：直接调本工具，plan 阶段会自动 `list_skills` 去重
- 蒸馏完成后建议跑一次 `mcp__skill-catalog__resolve` 确认新 skill 能被检索命中
- 大批量（>10 个 skill）的分 batch 策略由 plan LLM 按 avg estimated_tokens 启发式决定（<10K→4-5/batch；10-25K→3/batch；>25K→1-2/batch）
