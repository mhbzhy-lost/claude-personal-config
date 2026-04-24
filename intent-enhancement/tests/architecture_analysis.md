# 架构分析：qwen2.5:7b 能否被 bge-m3 embedding 替代

> 静态代码分析，范围覆盖 `mcp/skill-catalog` + `intent-enhancement`。结论先行：**方案 C（LLM 收窄到 tag 分类 + embedding 做语义排序）是现状，也是推荐保留的形态**；方案 B（纯 embedding）在当前 skill schema 下**原则上可行但会牺牲可解释的硬过滤**，需要先付出索引/阈值校准的一次性工程代价才能替换。

---

## Phase 1：LLM 现在到底做什么

整个仓库里**真正调用 qwen2.5:7b 的只有一处**：`mcp/skill-catalog/src/skill_catalog/classifier.py`。`intent-enhancement/` 目录里的 `intent_recognition/{engine,completer,analyzer}.py` 看似"意图识别引擎"，实际上**完全是正则 + 关键词库 + 模式匹配**（例如 `completer.py:65-110` 的 `DISCUSSION_BASED` / `PLAN_BASED` 等模式全是 `re.search`；`analyzer.py:37-89` 的 `tech_keywords` 是写死的字典查表）——它们根本不是 LLM 用户。

### 唯一的 LLM 调用点：`classifier.py:128-254`

- **调用目的**：从用户 prompt + workspace 指纹中，在**合法 tech_stack 闭集**（`catalog.available_tags()["tech_stack"]`）和**合法 capability 闭集**里各选出若干 tag。禁止生造（`classifier.py:239-244` 做硬 allowlist 过滤）。
- **输入**：system prompt（`classifier.py:18-81`，含 capability 速查表和 4 个 few-shot）+ user prompt（`_build_user_prompt`：合法 tag 列表 JSON + 指纹摘要 + 用户原文）。
- **输出形式**：受 `format` JSON schema（`classifier.py:84-91`）约束的结构化 `{"tech_stack": [...], "capability": [...]}`，temperature=0。
- **下游如何消费**：`pipeline.py:96-109` 拿 `tech_stack` / `capability` 做 `catalog.list_skills()` 的**硬过滤**（完全 tag 交集过滤，非打分），再交给 `ranking.rank()` 用 tag overlap + 关键词子串打分排序（`ranking.py:113-169`）。

### intent-enhancement 路径里 LLM 又在哪里？

`intent_enhanced_resolver.py:82-100`：增强路径**复用同一个 `Classifier`**——只要调用方没预填 tech_stack/capability，照样走一次 qwen 拿 tag。后续 `EnhancedSkillResolver.resolve()` 里的"意图识别引擎"走的是正则补全（`completer.py`），不是 LLM。

### bge-m3 做什么

`intent-enhancement/src/retrieval/hybrid_engine.py:143-394`：`VectorStore` 默认 backend = `ollama`（model 默认 `bge-m3`，见 `embedding_client.py:37-38`），索引内容是 **`name + " " + description`**（`hybrid_engine.py:325-326`，只用 frontmatter 里的两个字段，不索引正文）。检索时对 query 与 candidates 算余弦相似度，作为 `_rank_skills` 的 base score，再叠加整串 / token / tech_stack overlap 等**确定性 boost**（`hybrid_engine.py:691-772`）。没有阈值过滤，只是打分排序；top_k = `len(candidates)`。SQLite 缓存命中后零 HTTP。

**关键一点**：bge-m3 在现架构里**不承担过滤责任**，只做打分辅助；过滤 100% 靠 tag 硬 set 交集（`hybrid_engine.py:621-665`）。

---

## Phase 2 & 3：逐任务替代评估

把 LLM 分类器现在承担的工作拆成 4 个原子任务：

### 任务 A：从用户 prompt 抽 tech_stack（枚举闭集 top-k）

- 本质：受约束的**多标签分类**（闭集 allowlist）。
- embedding 替代：**Yes, partial**。做法：对每个合法 tech_stack tag（例如 `react`, `django`, `antd`）预算 embedding，再跟 query embedding 算 cos，取 `sim > θ` 的前 k 个。`bge-m3` 这种多语对称 embedding 做短 tag 名 vs 中文长 query 的相似度**对高频 tag（react / django）可用，对缩写或语义冷门 tag（如 `langgraph`、`cascader`）信号弱**。
- 风险：(1) 阈值 θ 需要离线调参，不同 tag 标定不同的最优阈值（bge-m3 对 "用 React 写弹窗" 与 tag "react" 的 cos 可能只有 0.4，与 tag "antd" 也是 0.4，但 "做个语音合成器" 与 "react" 也能到 0.3+ 的假阳性）；(2) 语义**指代消解**能力缺失——用户说"做个弹窗" + workspace 指纹有 react+antd，LLM 能理解**用户没主动提 react 但应该保留**（见 classifier.py:26-27 示例 1），pure embedding 要靠"把指纹文本拼进 query"才能逼近，且会把指纹里**无关栈一同拉进来**（LLM 的规则"无关栈剔除"靠语义理解实现，classifier.py:26，embedding 无法做反向排除）。

### 任务 B：从用户 prompt 抽 capability（枚举闭集 top-k）

- 本质：同样的受约束多标签分类，但标签空间更"概念化"（`ui-overlay`, `form-validation`, `task-scheduler` 等）。
- embedding 替代：**No（当前 tag 命名下）**。bge-m3 对 `ui-overlay` 这个**人造复合 slug** 的向量几乎没有语义——要让 embedding 能匹配，必须为每个 capability 准备一条"标签扩写文本"（例如 `ui-overlay = "弹窗 浮层 Modal Drawer Popover Tooltip Dropdown"`）做 tag-card embedding。这本质上就是把 `classifier.py:32-57` 的速查表**从 prompt 搬到索引里**——可行，但：
  - 需要新增一份"capability 标签卡片"维护资产
  - 该资产等同于 few-shot 的"蒸馏版"，信息量与 system prompt 基本等价
  - 更新一个 capability 语义需要重算其 card embedding，而 prompt 方案只需改字符串
- 风险：速查表里的 **"workspace 指纹无关栈剔除"** 这一条纯规则（见 classifier 示例 2），embedding 做不到——需要在 embedding 前或后补一层规则引擎。

### 任务 C：对话上下文理解 / 指代消解 / 跨轮意图延续

- 本质：多轮自然语言推理。
- embedding 替代：**No**。当前 `completer.py` 已用正则硬编码 `"按照我们刚才的讨论结果执行吧"` 类模板命中；embedding 同样无能（相似度可以命中，但无法把"讨论结果"替换成**具体的技术决策文本**）。**但这项能力现在并不是 LLM 在做**——是正则做的，且做得很浅（`completer.py:186-212` 的"补全"只是把 `dialogue_context.discussion_points[-1]` 拼进一个模板字符串）。
- 结论：这个任务**既不是 LLM 做，也不是 embedding 能做**，当前就是弱方案，和本次架构决策正交。

### 任务 D：skill 语义排序（query ↔ skill description）

- 本质：长文本相似度。
- embedding 替代：**Yes, already**。这任务**现在就是 bge-m3 在做**（`hybrid_engine.py:705-709`），LLM 没参与。无需替换。

---

## Phase 4：三方案对比

### 方案 A：LLM + embedding 混合（**现状**）

- LLM 做任务 A/B（tag 闭集抽取），embedding 做任务 D（语义排序）。
- 覆盖率：tag 抽取召回稳定（LLM 看得懂指纹+自然语言，且闭集 allowlist 保证不生造）；语义排序靠 embedding。估算能正确处理 **85–90%** 的 resolve 调用（剩余 10–15% 是 classifier transport 失败 / 返回空 tag 的长尾，现状靠 intent-enhancement fallback 承接）。
- 最主要失效场景：qwen 服务挂（`classifier.py:185-200` transport 异常）→ tag 为空 → `pipeline.py:114-115` 短路返回空 skills。已有 fail-soft，但质量骤降。
- 改动规模：0（现状）。
- 推荐度：**Strongly recommended**（保留）。

### 方案 B：纯 embedding（砍掉 LLM）

- 需要新增：
  - 每个 tech_stack tag 的 "标签卡片 embedding"（预写扩写文本 → 预算向量落 SQLite）
  - 每个 capability tag 的 "标签卡片 embedding"（等同把 classifier.py 的速查表蒸馏成 per-tag 文档）
  - 一层规则引擎做"无关栈剔除"（弥补 LLM 的语义剪枝能力）
  - 离线阈值调参流程（对每个 tag 标定 θ，或者统一 θ + 每 tag 单独校准 bias）
- 需要删除：`classifier.py` 全部、`pipeline.py:96-109` 的调用分支、`intent_enhanced_resolver.py:82-100` 的 classifier 入口、相关测试。
- 覆盖率估算：tech_stack 抽取**召回 70–80%**（tag 命名本身语义化时 OK，缩写/产品名差），capability 抽取**召回 60–75%**（需要依赖标签卡片质量）。整体估 **65–75%**，比方案 A 掉 15–20 个百分点。
- 最主要失效场景：(1) 用户说"做个 Celery 异步任务"但 workspace 指纹里没有 celery（只有 django）——LLM 能从用户原文优先提取 celery（classifier.py:24-25），embedding 需要 query 去和每个 tag card 硬算相似度，"Celery" 与 tag card "celery: 分布式任务队列..." 的 cos 依赖 bge-m3 对英文产品名的召回；(2) **指纹无关栈剔除**失效——monorepo 有 django+react，用户说"写个 React 弹窗"，embedding 会把 django 的 tag card 也拉回来（django 和 react 在 web 语境下相似度不低）。
- 改动规模：中等偏大。新增~3 个模块（tag_card_index、tag_card_embedder、tag_rule_engine），删除 classifier 整套，改 pipeline 主路径。估计 500–800 行新增、150 行删除。另加一次标签卡片资产编写（40+ tag 各写 1–3 行扩写，约 200 行 YAML/JSON）。
- 推荐度：**Not recommended**（在当前 tag schema + 无阈值调参经验下）。**Conditionally recommended** when：(i) 完成一轮离线 tag-card 阈值校准并在验证集上跑通；(ii) 愿意接受 15% 召回损失换掉 qwen 的运维成本；(iii) 标签卡片资产建立常态更新流程。

### 方案 C：LLM 收窄 + embedding 主力

- 方式：让 LLM 只在两种情况触发——(i) 用户 prompt 有明确**指代/跨轮引用**（"按刚才讨论的"、"按计划执行"，正则预分类后 fan-out 到 LLM 做意图 rewrite）；(ii) embedding 抽 tag 置信度低（top-1 cos 与 top-2 cos 差值小，或最高 cos < θ_fallback）。其他情况走纯 embedding。
- 覆盖率：理论上接近方案 A（90%）但 LLM 调用量降 60–80%。
- 改动规模：需要 embedding 路径（同方案 B 的标签卡片基础设施）+ 置信度路由器 + 指代检测正则。大于方案 B。
- 推荐度：**Conditionally recommended**，值得作为**后续优化方向**，但不应该是当下一步。前置依赖是先把方案 B 的标签卡片资产做出来。

---

## 最终推荐与"方案 B 可行的必要条件"

**推荐：保持方案 A（现状）**，理由：

1. LLM 现在只做两件窄事——tag 闭集抽取 + 指纹无关栈剔除。这两件都**不是 embedding 的强项**：前者本质是受约束多标签分类 + 指代消解，后者是基于语义的负向排除。bge-m3 对缩写产品名（`langgraph` / `antd`）和人造 slug（`ui-overlay`）语义稀薄。
2. 当前 classifier 已经做了 fail-soft + allowlist 硬约束 + temperature=0 + structured output，失效模式是"返回空"而非"返回错"，系统性风险低。
3. 删 LLM 的改动规模并不小（500–800 行 + 一份标签卡片资产 + 阈值校准），但收益仅仅是"少跑一次本地 qwen"——qwen 已经在本地跑，HTTP 延迟 < 1s，不是瓶颈。
4. 路径抽取评估的结论（正则 > 7B LLM）适用于**字符串结构性信息**（文件路径），不适用于**语义分类**（tech_stack / capability）——两者不是同一类任务，不能直接外推。

**方案 B 真正可行的必要条件**（给用户的 checklist）：

- [ ] 标签体系重命名完成：所有 capability 从 slug（`ui-overlay`）改为自然短语（`弹窗与浮层`），或额外维护一份 `tag → 扩写 description` 映射资产
- [ ] 离线验证集建立：至少 50 条 (user_prompt, workspace_fp, expected_tech_stack, expected_capability) 金标准样本
- [ ] 在该验证集上 bge-m3 tag 抽取召回 ≥ 85%（否则质量不足以替换 LLM）
- [ ] 规则引擎补齐"指纹无关栈剔除"（当用户 prompt 里出现 tag X，同指纹中其他 tag 若在用户 prompt 未被提及则降权）
- [ ] qwen 的本地部署成本确实是想砍的（否则无动力）

**三项中任一未满足，方案 A 优于方案 B**。

---

## 附：文件引用清单

- LLM 调用点（唯一）：`mcp/skill-catalog/src/skill_catalog/classifier.py:128-254`
- LLM 入口 1：`mcp/skill-catalog/src/skill_catalog/pipeline.py:96-109`
- LLM 入口 2：`intent-enhancement/src/integration/intent_enhanced_resolver.py:82-100`
- embedding 主体：`intent-enhancement/src/retrieval/hybrid_engine.py:143-394`（VectorStore）、`:691-772`（`_rank_skills` 语义基底）
- embedding 模型配置：`intent-enhancement/src/retrieval/embedding_client.py:37-38`（默认 `bge-m3`）
- embedding 索引内容：`hybrid_engine.py:324-326`（`name + " " + description`）
- 非 LLM "意图识别"（正则伪装）：`intent-enhancement/src/intent_recognition/completer.py:65-110`、`analyzer.py:37-89`
- 硬过滤与打分：`hybrid_engine.py:621-665`（tag 硬过滤）、`ranking.py:113-169`（legacy 路径 tag overlap 打分）
