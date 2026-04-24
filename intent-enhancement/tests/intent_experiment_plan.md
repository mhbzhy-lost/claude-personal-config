# 意图识别三系统对比实验 · 设计文档

> 目标：用实测数据回答"何种条件下正则不能胜任意图识别、需要引入 embedding/LLM"。产出可证伪、可重放的数字依据，取代 `architecture_analysis.md` 的静态推断。

---

## 1. 研究问题

本项目"意图识别"定义：在**路径已解决**（上轮 text_path_extractor 已达 F1≈81%）的前提下，从 (user prompt + 最近 N 轮对话 + 路径文件摘要) 中，产出对接 `skill-catalog` 的两个闭集标签：

- `tech_stack: List[str]` — 合法闭集 = `catalog.available_tags()["tech_stack"]`（当前 100+ tag）
- `capability: List[str]` — 合法闭集 = `catalog.available_tags()["capability"]`（当前 60+ tag）

三问：

- **Q1**：哪些 case 纯规则够（embedding/LLM 皆可省）？
- **Q2**：哪些 case 规则不够但 embedding 够（LLM 可省）？
- **Q3**：哪些 case 必须 LLM（embedding 也不够）？

---

## 2. 样本设计

### 2.1 样本源与规模

- 主源：`~/.claude/projects/-Users-mhbzhy-claude-config/*.jsonl`（92 份会话日志）
- 辅源：复用 `tests/path_extraction_eval.json` 中 40 条已 curated 的 snippet（路径 GT 已有，可省二次 curation）
- **合成样本**：claude-config 自有语料的技术栈分布极度集中于 `claude-code / agent / mcp / hook / subagent`（见下表）。为覆盖 L3 / L4 难度类、测出三系统在多栈 monorepo / 冷门产品名上的差异，**必须合成 8-15 条样本**（手写逼真的 user prompt + 对话上下文 + 指纹）。合成样本会显式标注 `synthetic=True`，报告里单独呈现其指标。

**claude-config 语料自有 tag 分布**（path_extraction_eval.json 40 条扫描）：

| tag | 出现次数 |
|---|---|
| agent | 31 |
| hook | 19 |
| mcp | 18 |
| subagent | 17 |
| python | 6 |
| ollama | 5 |

→ 天然不含 react/antd/django/celery/fastapi/nextjs 等主流栈，若只用真实数据无法回答 Q1-Q3 中涉及这些栈的问题。

### 2.2 目标样本量与难度分布

总量 **45-55 条**，按难度四级分布：

| 难度 | 含义 | 占比 | 预期条数 |
|---|---|---|---|
| L1 | 简单关键词命中；用户直说 "用 React 写弹窗" / 指纹里就有 celery | ~35% | 16-20 |
| L2 | 需指代消解；"那个 hook"、"前面说的配置"、"按刚才讨论的方案" | ~25% | 11-14 |
| L3 | 需反向排除；monorepo 多栈，用户只聚焦一个子栈（如 django+react 项目里只做 React 弹窗） | ~20% | 9-11 |
| L4 | 冷门 tag / 缩写歧义；`langgraph`、`antd`、`ui-overlay` 等人造 slug | ~20% | 9-11 |

### 2.3 每条样本的字段

```json
{
  "sample_id": "intent_NNN",
  "source": "real" | "synthetic",
  "source_session": "<jsonl stem>" | null,
  "difficulty": "L1" | "L2" | "L3" | "L4",
  "user_prompt": "<直接的用户当前诉求，单句或短段>",
  "dialogue_context": "<最近 N 轮对话摘要，可为空>",
  "fingerprint_summary": "<类似 classifier 消费的 workspace 指纹，例如 'language: python\\nconfig_files: pyproject.toml'>",
  "file_summary": "<prose_regex 抽出路径对应的文件 head-30 行截断，可为空>",
  "gt_tech_stack": ["..."],
  "gt_capability": ["..."],
  "gt_reason": "<一句话标注理由，用于审阅>",
  "keyword_baseline_tech_stack": ["..."],
  "keyword_baseline_capability": ["..."],
  "annotation_dispute": false
}
```

**三系统统一输入 = `user_prompt` + `dialogue_context` + `fingerprint_summary` + `file_summary`**（拼成一条 input text）。这是对等约束——否则 LLM 吃富文本、正则吃纯 user_prompt 就不公平。

---

## 3. Ground Truth 标注方法论

### 3.1 双源标注 + 冲突显式化

- **主标注**（Opus）：逐条读全上下文（含 file_summary），按 `classifier.py` system prompt 的规则（**用户原文优先 > workspace 指纹，无关栈剔除**）给出 `gt_tech_stack` / `gt_capability`，附 `gt_reason`。
- **辅标注**（机械关键词）：`rule_based_extractor.py`（系统 A 的实现）跑一遍，输出 `keyword_baseline_*`。
- **冲突检测**：若 `set(gt) △ set(keyword_baseline)` ≥ 2 个 tag，置 `annotation_dispute=True`；报告里单列这些争议 case 供 review。

### 3.2 偏见声明（必须写进最终报告）

本实验 **GT 由 Opus 标注**，而**系统 C 也是 LLM**（qwen2.5:7b）。这是偏向 LLM 系统的天然方法论缺陷。缓解手段：

1. GT 采用"更保守"的 tag 集合（宁少勿滥，必须用户原文或强指纹支持才纳入），避免 Opus 过度联想把 LLM 长板放大。
2. 冲突 case（机械标注与 Opus 差异大者）单列呈现，读者可人工判断。
3. 跨模型一致性：GT 标注时只看规则（不跑 qwen2.5），降低 qwen 与 Opus 联合偏好的可能。
4. 报告结论不作"LLM 绝对优于 embedding"的断言，只作**相对失效模式描述**（某类 case 某系统失效，数据给出）。

---

## 4. 三系统实现规范（对等约束）

### 4.1 系统 A · Rule-based（`rule_based_extractor.py`）

- 读合法 tag 闭集（启动时调 `catalog.available_tags()`）
- 为每个 tag 维护一张 `tag → [关键词/正则模式]` 映射表（简称 "rule book"），每 tag 3-10 条触发词
  - tech_stack 示例：`react: ["react", "jsx", "useState", "useEffect", "hooks"]`
  - capability 示例：`ui-overlay: ["弹窗", "浮层", "modal", "drawer", "popover", "tooltip", "dropdown"]`
- 匹配方式：大小写不敏感子串 + 词边界正则（对英文短 token 加 `\b`）
- 命中规则：只要任一关键词子串在 input text 中出现即纳入该 tag
- **不做反向排除**（规则法的已知短板——这是本实验要测的盲区）
- 输出 (tech_stack_list, capability_list, elapsed_s)

### 4.2 系统 B · Embedding（`embedding_tag_extractor.py`）

- 为每个 tag 写一张 **tag card**（1-3 行自然语言扩写），落 `tag_cards.json`
  - 示例：`"react": "React 前端框架，组件化，JSX，useState、useEffect、hooks，SPA"`
  - 示例：`"ui-overlay": "弹窗、浮层、模态框、Modal、Drawer、Popover、Tooltip、下拉菜单"`
- 启动时 batch embed 所有 tag cards，缓存在内存（用现有 `OllamaEmbeddingClient(model=bge-m3)`）
- query 侧：把 (user_prompt + dialogue_context + fingerprint_summary + file_summary) 拼接后 embed
- 评分：对 tech_stack tags 和 capability tags 分别算 query 与 tag card 的 cosine 相似度
- 选中规则：`cos >= θ` 的全部纳入
- 阈值 θ：通过 grid search 在 `{0.35, 0.4, 0.45, 0.5, 0.55, 0.6}` 中挑对全样本 F1 最优的（tech_stack 与 capability 各自独立调优）
- 输出 (tech_stack_list, capability_list, elapsed_s, chosen_threshold)

### 4.3 系统 C · LLM（qwen2.5:7b via skill_catalog.Classifier）

- 直接调 `mcp/skill-catalog/src/skill_catalog/classifier.py::Classifier.classify()`
- 入参对齐：user_prompt 传入 `user_prompt + "\n\n对话上下文:\n" + dialogue_context + "\n\n文件摘要:\n" + file_summary`；fingerprint_summary 传入 `fingerprint_summary` 字段原文
- 合法闭集：`catalog.available_tags()`（与 A/B 完全一致）
- 输出 (tech_stack_list, capability_list, elapsed_s)

### 4.4 对等约束清单

| 维度 | 要求 |
|---|---|
| 输入原文 | 完全一致（user_prompt + dialogue_context + fingerprint_summary + file_summary） |
| 合法 tag 闭集 | 同一份 `catalog.available_tags()` |
| 允许生造 | 均禁止（A 天然不可能，B 限制在 tag card 集合内，C 已有 allowlist 过滤） |
| 调用次数/样本 | 各 1 次 |
| 环境 | 相同 ollama 实例（bge-m3 + qwen2.5:7b）|

---

## 5. 评估指标

### 5.1 Set-based metrics

对每条样本、每个维度（tech_stack / capability）分别计算：

- `precision = |pred ∩ gt| / |pred|`（pred 空则 NaN 不计）
- `recall = |pred ∩ gt| / |gt|`（gt 空则当作 precision==1 计入）
- `f1 = 2·p·r/(p+r)`

### 5.2 聚合维度

- **总体**：全部样本的 micro-F1 + macro-F1
- **按难度分桶**：L1 / L2 / L3 / L4 独立出数
- **按来源分桶**：real vs synthetic 独立出数
- **延迟**：平均 elapsed_s（embedding 侧要区分"首次 embed tag card 的冷启动"vs"query 侧 embed"——只计 query embed 时延）

### 5.3 失效模式归类

对 miss（GT 有系统无）和 FP（系统有 GT 无）各自按以下类型归：

- miss 类型：`keyword-not-in-rulebook` / `abbreviation` / `anaphora-unresolved` / `fingerprint-only-no-prompt-mention` / `cold-tag` / `other`
- FP 类型：`keyword-collision`（如 `react` 出现在"react to it"）/ `unrelated-stack-not-excluded`（L3 反向排除失败）/ `broad-semantic-match`（embedding 把相邻概念拉进来）/ `other`

### 5.4 三问答案的判定规则

- **Q1 纯规则够的 case**：系统 A 的 per-sample F1 ≥ 0.8（tech_stack 和 capability 皆达标）
- **Q2 规则不够但 embedding 够**：A 的 per-sample F1 < 0.6 且 B 的 ≥ 0.8
- **Q3 必须 LLM**：A < 0.6 且 B < 0.6 且 C ≥ 0.8

样本按这三条判定归类后，统计各类占比 + 各取 1-2 个完整 case 写进报告。

---

## 6. 执行流程

### 步骤 1：样本采集（产出 `intent_eval_dataset.json`）
- 1a. 复用 `path_extraction_eval.json` 中有对话上下文的 snippet，抽 25-30 条
- 1b. 合成 15-20 条覆盖 L3/L4 + 主流栈（react/django/celery/fastapi/ios/oauth/payment 等）的样本
- 1c. Opus 逐条标 gt + reason，打 difficulty、source 字段
- 1d. 跑 `rule_based_extractor` 产出 `keyword_baseline_*` 字段，标 `annotation_dispute`

### 步骤 2：三系统实现
- 2a. `rule_based_extractor.py`（rule book）
- 2b. `embedding_tag_extractor.py` + `tag_cards.json`（tag card 资产）
- 2c. LLM 侧直接封装 Classifier 调用

### 步骤 3：执行与评分（`intent_eval_run.py`）
- 跑三系统 × 全样本
- 出总体 / 分桶 / 失效模式三张表
- 按 Q1/Q2/Q3 判定归类样本
- 持久化完整结果到 `intent_eval_results.json`，供后续审阅

### 步骤 4：报告（`intent_eval_report.md`）
- 方法论局限声明置顶
- 数据表 + 分桶表 + 失效模式表
- Q1/Q2/Q3 答案 + 每类 1-2 个完整 case（含 context / GT / 三系统输出 / 原因分析）
- 架构推荐

---

## 7. 失败模式与应对

| 风险 | 应对 |
|---|---|
| ollama 服务不稳 / qwen 返回空 | 跑 3 次取最好/中位数；若持续失败则报告里"该 case 系统 C 失败"单列，不剔除 |
| bge-m3 embed 延迟高 | tag card 预算一次缓存内存即可（约 170 个 tag × 1 次 embed = 固定成本）|
| 合成样本过度迎合某一系统 | 合成时刻意让 user_prompt 含指代（偏利 LLM）与只含文件路径（偏利规则）的样本各占一半 |
| GT 标注偏 LLM | §3.2 已声明，并用机械辅助标注 + dispute case 暴露 |
| 阈值 θ 过拟合到样本 | 阈值调优在全样本上做，不切 train/test（样本量太小切了更差）；报告里显式写"θ 选择基于本数据集"，外推风险单列 |

---

## 8. 产出清单（全在 `tests/` 下）

- `intent_experiment_plan.md` · 本文档（✅ 已完成）
- `intent_eval_dataset.json` · 样本 + GT
- `rule_based_extractor.py` · 系统 A
- `tag_cards.json` · tag card 资产
- `embedding_tag_extractor.py` · 系统 B
- `intent_eval_run.py` · 执行器 + 评分器
- `intent_eval_results.json` · 完整三系统输出
- `intent_eval_report.md` · 最终报告（答案 + 数据 + case + 推荐）

**不污染 `src/`**；实验闭环全在 `tests/` 内。
