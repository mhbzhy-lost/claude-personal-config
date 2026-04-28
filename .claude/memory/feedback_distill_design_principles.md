---
name: skill 蒸馏管线设计原则
description: 用户在 distill/ 项目上的关键设计偏好——双适配器是核心目标、单对话累积复用 cache、raw material 不进对话历史、长期成本优先、主 agent 视角接口极简
type: feedback
originSessionId: 58335a77-eb13-4749-9df6-6a5ce62c4ba3
---
distill/ 蒸馏管线的设计偏好（2026-04-28 多轮对话固化，v0.5 收敛）。

## 1. 双适配器（DeepSeek + Qwen）是核心目标，不是过度设计

**Why**: 用户的核心动机是对比两家 API 的缓存命中率和真实价格。简化时不能为了"少代码"把双适配器砍掉。

**How to apply**: 重构提案如果建议合并/删除 adapter.py 的双家结构，必须先确认是否影响成本对比能力。

## 2. 单对话累积复用 cache，但 raw material 不进对话

**Why**: OpenAI SDK 单对话的优势是 prefix cache 命中（system prompt + reasoning + tool 调用历史），不是把所有内容塞进对话。raw material（每篇 5-50KB markdown）反复 attend 即便 cache 命中也累计大量 token。

**How to apply**: build 对话用 read_file 按需读盘 vs 一次性灌入；新加 stage 时优先选 user message 推进而不是塞素材到 system prompt。

## 3. 长期运行成本优先于一次性优化

**Why**: 蒸馏不是一次性任务，是长期批量运行。优化目标是 cache hit rate / per-skill cost / 双家对比可观测性，而不是单次 elapsed_ms。

**How to apply**: 加新功能时如果与 cache 友好性冲突（例如破坏 prompt prefix 稳定性、引入随机性），需要权衡或放弃。summary.json 必须保留可统计的成本字段。**禁止**用 LLM 上下文压缩——压缩破坏 prefix cache + 压缩调用本身要钱，反而比累积更贵。

## 4. uv 管理依赖，不动系统 Python

**Why**: 用户多次强调环境隔离偏好，反对 pip install 装系统环境。uv run 自动懒加载 venv，主 agent 不需要预先 sync。

**How to apply**: 新依赖加到 `distill/pyproject.toml` 后跑 `uv sync`，绝不用系统 pip。

## 5. 模型版本严格按用户指定

**Why**: 用户上一会话强调"用 qwen3.6-max-preview，不要 qwen-max"——指定具体版本时严格执行。

**How to apply**: 跑 Qwen 时用 `DISTILL_MODEL=qwen3.6-max-preview` 配 `.env` 或 CLI `--model`。如果用户提到具体模型版本，记下并复用。

## 6. 主 agent 视角接口极简，技术细节下沉

**Why**: 工具最终给主 agent 调用，主 agent 不应关心 batch_size / tech_stack / API key / provider 这些技术参数。CLI 应该只暴露语义参数（"做什么"+"放哪"），其他从 .env / plan LLM 输出 / 系统启发式推导。

**How to apply**: 加新参数前问"主 agent 真的需要决定这个吗？"——如果不需要，下沉到 .env 或 plan LLM 输出。当前主 agent 视角 CLI 只有 2 个语义参数：`--intent` 和 `--skills-base`，不要回归暴露 provider / api-key / batch_size。

## 7. secrets 走 .env，不走 CLI

**Why**: API key 通过 CLI 参数会出现在 process list / shell history / 日志，不安全。

**How to apply**: provider 和 API key 都在 `distill/.env` 配置（参考 `.env.example`），CLI 完全不接受这两个参数。`.env` 已加到 .gitignore，`.env.example` 是 commit 模板。**主 agent 不能自行写入 .env**——涉及用户 secrets，缺失时必须先提示用户配置。

## 8. 5 stage 多 agent 设计是 Claude Code 历史方案，与新管线无关

**Why**: claude-skills/skill-distillation/ 的 5 个 subagent 是历史方案（已删）。OpenAI SDK 管线已是 v0.5 的 3-stage，不要混淆。

**How to apply**: 不要为了"和历史保持一致"把 OpenAI SDK 管线退回 5 stage。distill/ 是单一权威实现。

## 9. 做之前先调研业内实践

**Why**: 用户曾说"做之前先看看业内有没有现成产品，没准已有"。Skill 蒸馏方向上的 Corpus2Skill / Skill Seekers 等都调研过。

**How to apply**: 提新工程方案前先 web_search 看业内有无现成方案，再决定是造轮子还是借鉴。

## 10. 标签闭集是 SoT，散落多处会失同步

**Why**: 早期把 capability/tech_stack 闭集放在 references md，pipeline inline 自己写一份简化版导致两套闭集严重不一致——pipeline 漏掉真闭集成员、又自造伪枚举，产出的 SKILL.md 标签全部不合规。

**How to apply**: 闭集只在 `<skills_base>/_tag_catalog.json` 维护，mcp 与 distill 都从此处读。新增 key 时蒸馏管线自动 append，用户后续手动补 description。绝不在代码中 hard-code 闭集副本。
