---
name: skill 蒸馏管线（distill/）当前架构
description: claude-config 仓库下 distill/ 是基于 OpenAI SDK 的 skill 蒸馏管线 v0.5，3-stage 架构（plan + fetch script + build 单对话），双适配器支持 DeepSeek/Qwen 成本对比，主 agent 通过 ~/.claude/skills/skill-distill/ 调用
type: project
originSessionId: 58335a77-eb13-4749-9df6-6a5ce62c4ba3
---
`/Users/mhbzhy/claude-config/distill/` 是 skill 蒸馏自动化管线（**注意：已从 scripts/distill/ 移到顶层 distill/**），重构于 2026-04-28。

## 双 skill 库语义区分（重要）

```
~/.claude/skills/  →softlink→  claude-config/claude-skills/    Claude Code skill（slash cmd / agent helper）
                                                                如 git-commit / skill-distill / knowledge-retrieval

claude-config/skills/                                           真正的技术知识库（mcp/skill-catalog 索引此处）
                                                                antd / fastapi / kafka / kubernetes 等 40+ 分类
                                                                ← 蒸馏产出必须落这里
```

**Why**: 区分"工具 skill"与"技术 skill"——前者扩展 Claude Code 能力，后者是检索用知识包。蒸馏产物落错位置（claude-skills/）会导致 mcp 检索不到。

**How to apply**: 调蒸馏工具时主 agent **必须显式 `--skills-base /Users/mhbzhy/claude-config/skills`**，不知道时向用户问 ABC 选项。

## v0.5 架构（3-stage，单对话累积 cache 友好）

1. **plan**（LLM 对话）：解析 intent → 输出 plan.json（含 tech_stack 推断、constraints、skills、build_batch_size、build_batch_rationale）
2. **fetch**（纯脚本）：按 plan 循环 web_fetch + write_file → `<output_dir>/<tech>/<skill>/raw/`，零 LLM 调用
3. **build**（LLM 单对话，每 batch 一次）：messages 数组贯穿 3 step（preprocess → SKILL.md → mark capability），跨 batch 共享 system prompt cache

**Why**: 5 stage 旧实现把同一对话切成 5 次 messages 重置浪费 cache + 重塞 raw material。3 stage 让 raw material 留在磁盘外（LLM 通过 read_file 按需读盘），单 batch 内复用 cleaned 前缀，cache 命中率 88-94%（DeepSeek 单 88%/multi 94%；Qwen 显式 cache_control 后单 81%/multi 88%）。

**How to apply**: 改这个管线时不要回退到 5 stage 独立 LLM 调用。新加 stage 应该是 build 对话内一次 user message 推进，不是新起 messages 数组。

## 主 agent 视角 CLI（极简，2 个语义参数）

```bash
cd /Users/mhbzhy/claude-config/distill && \
  uv run skill-distill \
    --intent "<自然语言意图>" \
    --skills-base /Users/mhbzhy/claude-config/skills \
    [--max-skills N for testing] \
    [--model OVERRIDE]
```

技术细节全部下沉：
- provider 选 deepseek/qwen → `distill/.env` 的 `DISTILL_PROVIDER`
- API key → `.env`（never CLI，避免出现在 process list / 日志）
- model 默认 → `.env` 的 `DISTILL_MODEL`，CLI `--model` override
- build_batch_size → plan LLM 探索后输出
- tech_stack → plan LLM 从 intent 提炼
- 标签闭集 → `<skills_base>/_tag_catalog.json`（mcp + distill 共消费）
- budget 公式 → 系统按 N skill 自适应（`8+7N / 5+4N / 4+3N`）

## 标签闭集 SoT：`/Users/mhbzhy/claude-config/skills/_tag_catalog.json`

`schema_version: 1`，含 capability 62 keys / tech_stack 109 keys / language 16 项。

dict 形态（`{key: description}`）or list 形态（仅 keys）都支持。新 key 蒸馏管线自动 append（value=null），summary.config.new_tags_appended 留痕。

**两个消费方**：
- `mcp/skill-catalog/scanner.py available_tags()`：优先读此 json，fallback 反推
- `distill/pipeline.py BUILD_PROMPT`：加载时注入完整闭集，强约束 LLM 打标只能选闭集内 key

## 关键文件

- `distill/pipeline.py`: 主流程（含 PLAN_PROMPT / BUILD_PROMPT / 3 step nudge / argparse / main）
- `distill/adapter.py`: DeepSeekAdapter + QwenAdapter（reasoning_content 回传 + Qwen cache_control 动态推到末条非 assistant 消息）
- `distill/tools.py`: web_fetch / web_search / write_file / read_file / list_files / list_skills / run_shell
- `distill/persistence.py`: RunRecorder + StageRecorder + FetchLogger（schema_version=2）
- `distill/.env.example`: 用户配置模板（必填 DISTILL_PROVIDER + 对应 KEY）
- `distill/pyproject.toml`: uv 管理，py-modules 扁平
- `claude-skills/skill-distill/SKILL.md`: 主 agent 入口包装（含环境/路径前置 + 标签闭集 + 初始化机制）

## 产物结构

```
runs/<ts>/
├── config.json
├── summary.json (schema_version=2，含 per_model_cache + new_tags_appended)
├── plan/{transcript.jsonl, stats.json, final_output.txt}
├── fetch/{log.jsonl, stats.json}
└── build/
    ├── batch_0/{transcript.jsonl, stats.json, final_output.txt}
    ├── batch_1/{...}
    ...
```

SKILL.md 落到 `<skills_base>/<plan 推断 tech_stack>/<skill_name>/SKILL.md`。

## 已验证（v0.5 baseline）

- DeepSeek-V4-Pro single-skill: cache 88% / 7.5KB SKILL.md / 436s
- DeepSeek-V4-Pro multi-skill (4 skill): cache **93.9%** / 4/4 ✅ / 17min
- Qwen3.6-max-preview single-skill: cache 81% / SKILL.md / ~10min
- Qwen3.6-max-preview multi-skill (3 skill): cache **88%** / 3/3 ✅ / 13min
- 软熔断兜底 / partial output 落盘 / reasoning_content 回传 / Qwen 显式 cache_control 全部跑通
- mcp pytest 130/130 / distill smoke 6/6 全绿

## 已知短板

- `pipeline.py` 1300+ 行（含 800+ 行 prompt 字符串），prompts 可抽到独立模块——非阻塞
- build cumulative budget 跨 step 不强制（理论上 step 1 可偷 step 2 预算，实测未触发）
- fetch 无 retry，单次失败放弃
- transcript 体积可能很大（多 skill 多 batch），未做 retention

## 相关 git commits

- `f936bd2` feat(skills): 增加 _tag_catalog.json 权威标签闭集
- `3524d76` feat(mcp/skill-catalog): available_tags 优先读 _tag_catalog.json
- `974231b` feat(distill): 增加 OpenAI SDK 双适配器 3-stage 蒸馏管线（含 scripts/distill → distill/ 迁移）
- `e16bc34` refactor(claude-skills): 用 skill-distill 替代 skill-distillation
