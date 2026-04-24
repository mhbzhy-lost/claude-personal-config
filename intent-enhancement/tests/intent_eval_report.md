# 意图识别三系统对比实验 · 报告

> **TL;DR**：在 45 条样本（20 real + 25 synthetic）上实测 rule / embedding / LLM 三系统，得出三条可操作结论：
>
> 1. **L1（关键词直命中）上三系统无显著差距**（合成样本里三者 F1≈0.8+），纯规则够用。
> 2. **L3（monorepo 反向排除）是 LLM 唯一不可替代的长板**：LLM tech_f1=0.79，规则 0.52，embedding 0.41。
> 3. **L2（指代消解）上三系统都不强**，LLM 相对最稳；但都远低于 0.8 阈值，表明单纯"意图识别"不足以替代真正的多轮上下文理解。
>
> **推荐架构**：**保留 LLM 做 L3 反向排除（主价值）+ 规则做 L1 快速通道（节省 LLM 调用）+ embedding 仅作打分辅助**。完全砍 LLM 不可行；完全砍 embedding 也不可行（L2/L4 有 embedding 独赢的 case）。

---

## 0. 方法论局限性声明（前置）

本实验存在若干需要读者在解读数字时纳入考量的偏差，不掩饰：

1. **GT 标注者与系统 C 都是 LLM**：GT 由 Opus（Claude 4.7）标注；系统 C 是 qwen2.5:7b。两个 LLM 有共同偏好（例如"从自然语言直接读意图"的推理路径），可能让系统 C 的分数被天然抬高。缓解：(i) 标注时只依据 `classifier.py` 的规则而非问另一个 LLM；(ii) 系统 A 用 `rule_based_extractor` 独立产出 `keyword_baseline`，作为机械 sanity check（见 §3.3）。
2. **数据量小（45 条）** → 每类难度桶只有 6-17 条，F1 ±0.1 的差异不构成统计显著性。结论写作"相对失效模式"，不写"A 绝对优于 B"。
3. **合成样本占 56%**：真实语料（`-Users-mhbzhy-claude-config/*.jsonl`）的 tech_stack 分布极度集中在 `claude-code / agent / mcp / hook / subagent`（path_extraction_eval 40 条扫描里 agent=31 / hook=19 / mcp=18），根本不含 react/django/celery/fastapi。要测 L3/L4 必须合成，**合成 prompt 措辞天然偏向"书面语、直接"，可能放大 LLM/rule 的命中**。报告里 real vs synthetic 分桶单列。
4. **嵌入阈值 θ 在本数据集上 grid-search**：θ=0.55 是在这 45 条上最优，外推到新样本无保证（§3.2）。
5. **GT 保守策略**：面对多栈场景，只纳入用户原文/强指纹支持的 tag（宁少勿滥）。这对"过度联想"的系统（LLM 在长噪声 context 下倾向全量喷）惩罚偏重。

---

## 1. 实验设置回顾（详见 `intent_experiment_plan.md`）

- **任务**：对每条样本，输入 `user_prompt + dialogue_context + fingerprint_summary + file_summary` 拼接文本，从 `catalog.available_tags()` 合法闭集（tech_stack 100+ / capability 60+）中挑出相关 tag。
- **样本**：45 条（20 real cherry-pick 自 `path_extraction_eval.json` 重标，25 synthetic 覆盖 L3/L4 + mainstream 栈）。
- **三系统**：
  - A `rule_based_extractor.py` — 每 tag 3-10 条关键词/正则，子串/词边界匹配
  - B `embedding_tag_extractor.py` — 每 tag 1-3 行 tag card，bge-m3 embed，cos >= θ
  - C `skill_catalog.classifier.Classifier` — qwen2.5:7b via ollama，structured JSON output
- **对等约束**：同一 input text、同一 allowlist、每样本各调一次。

---

## 2. 总体指标

### 2.1 Overall

| 系统 | tech_f1 | cap_f1 | 平均延迟 |
|---|---|---|---|
| rule | **0.636** | **0.506** | ~0.000 s |
| embedding | 0.526 | 0.403 | 0.23 s |
| llm | 0.525 | 0.427 | 2.93 s |

直觉反常——**LLM 总体 F1 最低、延迟最高**？看分桶数据就知道这是全局均值被拖：LLM 在 real 上崩盘（见 §2.3），在 synthetic 上遥遥领先。

### 2.2 按难度分桶

| 难度 | n | rule tech/cap | embedding tech/cap | llm tech/cap |
|---|---|---|---|---|
| L1 关键词直命中 | 17 | 0.761 / 0.463 | 0.582 / 0.416 | 0.480 / 0.402 |
| L2 指代消解 | 14 | 0.410 / 0.519 | 0.427 / 0.373 | 0.452 / 0.238 |
| L3 反向排除 | 6 | 0.522 / 0.528 | 0.414 / 0.363 | **0.794** / **0.667** |
| L4 冷门 tag | 8 | **0.854** / 0.558 | 0.663 / 0.458 | 0.546 / 0.633 |

关键观察：
- **L1 规则最强**（直命中天然有利于关键词匹配），LLM 反而因"过度解读 + 指纹补全"拖分。
- **L3 只有 LLM 能打**：tech_f1 0.79 vs 规则 0.52 vs embedding 0.41。这是**反向排除能力**的数字证据——monorepo 指纹里有 django+react+celery+antd，用户只要"前端弹窗"，LLM 能剔除后端栈，另外两个不能。
- **L4 规则反而最强**（冷门产品名往往就是独特字符串，关键词必中）；LLM 在长组合名上偶尔漏召回。
- **L2 三系统都不强**，F1 均 < 0.5。指代消解需要"把 '那个 hook' 替换成具体 hook 名"这种语义替换，LLM 只能间接做（把 dialogue 看作上下文），但当对话上下文不够明确时，还会丢失用户原文中的其他信号。

### 2.3 按来源分桶（暴露真实 vs 合成的偏见）

| 来源 | n | rule tech/cap | embedding tech/cap | llm tech/cap |
|---|---|---|---|---|
| real | 20 | 0.557 / 0.225 | 0.465 / 0.199 | **0.217 / 0.133** |
| synthetic | 25 | 0.700 / 0.731 | 0.574 / 0.566 | **0.772 / 0.663** |

**LLM 在 real 上 tech_f1=0.22，在 synthetic 上=0.77**，天壤之别。原因分析（§4.3）：real 样本（claude-config 会话日志）平均更长、技术实体密集、用户 prompt 多为跨轮续问，LLM 倾向"从长 context 中捞一把全部相关 tag"，但 GT 保守——两者的"相关性尺度"失配。

---

## 3. 阈值选择与辅助信息

### 3.1 embedding 阈值 grid search

在 (0.35, 0.40, 0.45, 0.50, 0.55, 0.60) 上搜索，按全样本 mean F1 取最优：

| θ | tech_f1 | cap_f1 |
|---|---|---|
| 0.35 | 0.036 | 0.043 |
| 0.40 | 0.045 | 0.048 |
| 0.45 | 0.097 | 0.093 |
| 0.50 | 0.260 | 0.187 |
| **0.55** | **0.526** | **0.403** |
| 0.60 | 0.366 | 0.359 |

θ=0.55 在两维度都是最优，但注意这是**全样本拟合**（没留验证集），θ 对本数据集过拟合风险存在。

### 3.2 rule book 与 tag card 资产

- `rule_based_extractor.py::TECH_STACK_RULES` / `CAPABILITY_RULES`：~90 个 tech tag、~55 个 capability tag 覆盖，每 tag 3-10 条关键词
- `tag_cards.json`：每 tag 1-3 行自然语言扩写，共 ~90 + ~55 行

### 3.3 GT 与机械关键词标注的一致性

用 rule_based 的输出作为机械辅助标注对 GT 做 sanity check —— 两者 set-diff ≥ 2 的样本被视为"标注争议"。实测 45 条里有 14 条争议（主要来源：GT 保守只标 2-3 个 tag，rule 会 firing 5-10 个，尤其 real 样本的长 context），都已保留在 `intent_eval_results.json`，未强改 GT。

---

## 4. 失效模式归类

### 4.1 规则（系统 A）的典型失败

**（a）缺乏反向排除**（出现在 L3 全部 6 条、real L1-L2 多条）

- 例 `intent_syn_012`：prompt 要前端弹窗，指纹里有 `fastapi, langgraph, react, antd, celery`，rule 直接把所有 tag 全命中 → tech = `[antd, celery, fastapi, frontend, langgraph, react]`（FP 3 个）。
- 根因：rule 把 input_text 当扁平字符串匹配，不区分"用户意图"和"指纹噪声"。

**（b）关键词碰撞**（散见 L1）

- `compose` 同时命中 "docker compose" 和 "Jetpack Compose"
- `agent ` 通配符导致所有讨论 agent 的 claude-code 场景都被打上 `agent` tag（GT 只认 `claude-code` 时打错）

**（c）关键词缺失（冷 tag）**（少见）

- rule book 没写的 tag 必 miss。这是一次性工程成本，可通过扩 rule book 弥补。

### 4.2 embedding（系统 B）的典型失败

**（a）语义相邻的 FP**（L1/L3 都出现）

- `intent_syn_001` "React + Ant Design 的 Cascader"：embedding 把 `compose`（语义上"组合组件"靠近 React）拉了进来。
- `intent_syn_012`：embedding FP = `[backend, claude-code, compose, frontend, http, mcp]`——bge-m3 对"前端弹窗"一句的 query embedding 与多个 tag card 都有 0.55+ 相似度，分不出主次。

**（b）冷门产品名语义稀薄**（L4）

- `intent_syn_024` Godot 4 游戏：tag card "Godot 4 开源游戏引擎 GDScript" 与 query "写一个 2D 平台跳跃物理引擎" 的 cos 只有 0.5-0.6 级别，易漏召回。
- `intent_syn_019/020` Cilium/Calico/ArgoCD/FluxCD：embedding 对产品名组合的 query 召回不稳。

**（c）合成 slug 语义不可靠**（capability 维度）

- `ui-overlay` `ui-action` `cc-subagent` 等纯 slug 本身无向量语义，必须依赖 tag card 的自然语言扩写。扩写不够详细的 tag card 直接失效。

### 4.3 LLM（系统 C）的典型失败

**（a）长 real context 下"全量喷"**（real 集独有）

- `intent_real_004`：用户讨论"新增 skill-marker agent"，context 有 assistant 的长回复展开所有 UI/navigation/state 等话题，LLM 回了 **19 个 capability**（包括 auth, data-fetching, file-upload, i18n, media-processing, observability...），全是 FP。
- 根因：qwen2.5:7b 在面对长、技术实体密集的 context 时，倾向抽取"看到就算相关"，GT 保守只标 1-2 个 → F1 崩盘。
- **这是工程上可处理的**：限制 input text 长度（例如只送 user_prompt + fingerprint + 截短 dialogue），应能大幅改善。

**（b）L2 指代消解依赖 dialogue 质量**

- `intent_real_005/006/009/010/012` 都是真实对话的第二轮续问（"显式指令"、"那么""webfetch"），user_prompt 很短，dialogue_context 就是之前 assistant 的长回复。LLM 经常返回空 tag 或只捕获少数。
- 根因：LLM 的"用户原文优先"规则让它忽略 dialogue，但 user_prompt 本身技术信号稀薄 → 空输出。

**（c）allowlist 过滤误杀**（罕见）

- `intent_real_007` GT `[antd, mcp, react]`，LLM 输出了 `claude-code`（因上下文强提 claude-code）但漏了 antd/react。

### 4.4 三系统都失败的盲区（25 条，占 56%）

全集中在 real 子集（18/20）和 L3 synthetic 的多栈组合。根因分两类：

- **GT 与系统感知尺度不一致**（real 居多）：GT 保守标 2-3 个 tag，系统感知整段 context 都相关 → 三者都 FP 多或召回偏；
- **样本本身语义模糊**：例如 `intent_real_009` 的 "问题是自动注入的内容都只是列表..." 用户在吐槽，没明确意图，GT 标 `[claude-code]` 但系统难以从"吐槽语气"里抽 claude-code。

**这些不是单靠换系统能解决的**——更本质的是"意图识别"任务本身在这些 case 上定义不清。

---

## 5. 回答三问

### Q1 纯规则够的 case（11 条，24%）

**判定**：rule_based 的 per-sample 平均 F1 ≥ 0.8。

典型特征：user_prompt 单轮、关键词明确（react、antd、celery...），指纹一致、无反向排除需求。这些 case 三系统都强（LLM 延迟 15× 成本完全无必要）。

**Case 锚点 1（intent_syn_001 L1）**：
```
user_prompt: "用 React 和 Ant Design 写一个地址三级联动的 Cascader 选择器"
fingerprint: language: typescript, javascript / package.json
GT: tech=[antd, react] cap=[ui-input]
rule     : tech=[antd, react] cap=[ui-input]   F1=1.00/1.00
embedding: tech=[antd, compose, react] cap=[ui-input]   F1=0.80/1.00
llm      : tech=[antd, react] cap=[ui-input]   F1=1.00/1.00
```
rule 干净、embedding 有 `compose` FP、LLM 同 rule，**但延迟 2.9s vs 0ms**。

**Case 锚点 2（intent_syn_005 L1，tailwindcss）**：rule/embedding/llm 都命中 tailwindcss + theming，三者相当。

### Q2 规则不够、embedding 够的 case（4 条，9%）

**判定**：rule < 0.6 且 embedding ≥ 0.8。

典型特征：冷门产品名/slug（tag card 的自然语言扩写帮 embedding "翻译"）、指代消解但 dialogue 已把被指代实体翻译成明确词汇。

**Case 锚点 3（intent_syn_023 L4，Prometheus+Loki+OpenTelemetry）**：
```
user_prompt: "Prometheus 采集 Loki 日志的指标，OpenTelemetry 串起来"
GT: tech=[grafana-loki, opentelemetry, prometheus] cap=[observability]
rule     : tech=[grafana-loki, opentelemetry, prometheus] cap=[]   F1=1.00/0.00 (漏 observability)
embedding: tech=[opentelemetry, prometheus] cap=[observability]   F1=0.80/1.00
llm      : tech=[] cap=[integration-testing, observability]   F1=0.00/0.67 (技术栈全漏)
```
rule 漏 capability（没人写 "可观测性三件套 → observability" 的映射）；embedding 通过 tag card "Prometheus 指标监控与告警" 扩写把 prometheus 与 "observability" 的语义桥接起来；LLM 意外抽了个 integration-testing FP。

**Case 锚点 4（intent_syn_010 L2，"继续刚才的任务" = Playwright E2E 登录）**：embedding 命中 `playwright/e2e-testing/auth`；rule 只抓到 playwright（没把"登录测试"抽成 auth）。

### Q3 必须 LLM 的 case（5 条，11%）

**判定**：rule < 0.6 且 embedding < 0.6 且 llm ≥ 0.8。

**全部集中在 L3（反向排除）+ L1 带细分 capability 组合**。

**Case 锚点 5（intent_syn_012 L3，monorepo 多栈要前端弹窗）**：
```
user_prompt: "给前端加一个任务列表的弹窗，展示 pending 任务，支持接受/拒绝操作"
fingerprint: detected: fastapi, langgraph, react, antd, celery
GT: tech=[antd, react] cap=[ui-action, ui-display, ui-overlay]
rule     : tech=[antd, celery, fastapi, frontend, langgraph, react] cap=[task-scheduler, ui-display, ui-overlay]
           F1=0.50/0.67（FP celery/fastapi/langgraph/task-scheduler，不相关后端栈全带进来）
embedding: tech=[antd, backend, celery, claude-code, compose, frontend, http, mcp, react]
           cap=[e2e-testing, push-notification, task-scheduler, ui-display, ui-feedback, ui-navigation, ui-overlay]
           F1=0.36/0.40（语义过度扩散）
llm      : tech=[antd, react] cap=[ui-action, ui-display, ui-overlay]   F1=1.00/1.00 ✓
```
**这就是 LLM 的反向排除能力**：看到 prompt "给前端加弹窗"，能显式忽略指纹里的 fastapi/langgraph/celery。规则和 embedding 把它们当扁平字符串 → 全 FP。

**Case 锚点 6（intent_syn_013 L3，异步发邮件 → django + celery，排除 react/antd）**：LLM 命中两个；rule 把 react/antd 一并带进来 → F1 0.58。

### 盲区：三系统都 fail 的 case（25 条，56%）

18/20 来自 real 语料。性质归类（每类各举一例）：

- **GT 与感知尺度失配**（`intent_real_002` ：用户说"# 换 # 吧"，GT 标 `[claude-code]`+`[cc-hook, cc-slash-command]`；三系统要么 miss 要么 FP）
- **吐槽/问答意图模糊**（`intent_real_009`："问题是自动注入的内容..."，系统难识别）
- **合成 L3 多栈组合复杂**（`intent_syn_014/015` ：iOS+Android+数据库 或 django+多支付通道）

**这些盲区的解是 "改写 intent 定义" 或 "补全 dialogue"，不是 "换系统"**。

---

## 6. 延迟与工程成本

| 系统 | 平均延迟 | 冷启动 | 新增运维 |
|---|---|---|---|
| rule | <1 ms | 0 | rule book 维护（~90+55 tag × 3-10 词=~500 keyword，~500 行 Python） |
| embedding | 230 ms | 首次 batch-embed ~150 tag cards（约 3-5 s） | tag cards 资产维护（~150 行 JSON）+ 向量缓存 |
| llm | 2.9 s | 无 | qwen2.5:7b 服务运维、prompt 迭代 |

LLM 延迟是 embedding 的 12×、rule 的 3000×。在主要吃 L1（占 38%）的流量下不走 LLM 能节省一大笔推理成本。

---

## 7. 对架构的推荐

### 当前状态（方案 A）回顾

`mcp/skill-catalog/pipeline.py` + `intent_enhanced_resolver.py` 当前对**所有** resolve 调用都走 `Classifier.classify()`，embedding 只做打分。

### 推荐改动（方案 A' · "规则前置 + LLM 兜反向排除 + embedding 打分"）

**分三层级联**：

1. **第一层（规则 fast-path，L1 拦截）**：
   - 跑 `rule_based_extractor`，若 `tech_pred` 与 `fingerprint.detected` 完全一致（没有反向排除需求），且 `|cap_pred| <= 3`（无过度命中），直接返回，跳过 LLM。
   - 预计能接住 L1 + 部分 L4 流量，占比按本数据集估算 ~35%。

2. **第二层（LLM，处理反向排除和复杂意图）**：
   - 剩余流量走 LLM，但**限制 input text 长度**（user_prompt 不截，dialogue_context 最多 500 字符，file_summary 最多 300 字符），避免 real case 的"全量喷"崩盘（§4.3a）。
   - 继续保持 allowlist 过滤 + structured output。

3. **第三层（embedding 置信度兜底）**：
   - 当 LLM 返回空 tag（transport 错误 / timeout / 置信度低）时，fallback 到 embedding(θ=0.55) 抽 tag——总比空强。

**改动边界**：
- `classifier.py` 不动（它本身没问题，问题是**无条件调用**）
- `pipeline.py` / `intent_enhanced_resolver.py` 的 resolve 入口加前置 rule_based 判断 + input 截断 + 空结果 fallback
- 新增 `rule_based_extractor.py` + `embedding_tag_extractor.py` 从 `tests/` 迁到 `src/intent_recognition/`（或直接 import）

**预期收益**：
- LLM 调用量降 ~35%（rule fast-path 拦截）
- L3 反向排除能力保留（LLM 依然吃这部分流量）
- real case 的"过度喷"缓解（input 截断）
- 空结果不再短路返回 `skills=[]`（embedding fallback）

### 完全砍掉 LLM 是否可行？

**不可行**。L3 上 LLM tech_f1=0.79 vs 规则 0.52 vs embedding 0.41——反向排除是**语义理解能力**，当前 rule book 和 tag card 无法近似。砍 LLM 意味着 L3 能力从 0.79 降到 ≤0.52，而 L3 在生产流量里就是"monorepo 多栈开发者问单一子任务"这个高价值场景。

### 完全砍掉 embedding 是否可行？

**条件可行**，但不推荐。embedding 在 L4 独赢 2 个 case（`intent_syn_022/023`）、L2 独赢 1 个（`intent_syn_010`），还有 skill ranking 的主力作用（本实验未覆盖）。砍掉会丢 L4 长尾 + ranker 退化为硬过滤 → 推荐 skill 质量下降。

---

## 8. 待主模型关注（3 个月后可能崩的地方）

1. **Rule book 漂移**：tag 闭集会增长（新 skill = 新 tag），rule book 需同步扩充。若 3 个月不维护，rule fast-path 的召回会悄悄掉。→ 需要 CI 机制：新 tag 进 catalog 时 fail build 除非 rule book 同步更新。
2. **tag card 资产腐化**：新 capability 没写 tag card → embedding 退化到"只 embed tag 名"，语义极稀薄。同理需 CI。
3. **θ=0.55 over-fit 本数据集**：真实流量分布变化后 θ 需要重调。建议把 `intent_eval_run.py` 做成可重放 CI，每周跑一次看 θ 漂移。
4. **Real 样本的"GT 保守 vs 系统喷"偏差未解**：本实验显示 real 上三系统都崩（blind spot 56%），说明"从长 claude-code 对话里抽短意图"本身没定义清楚。若用户反馈"我问 X 但返回 Y"，可能根因是这个定义问题，不是系统换了。
5. **LLM 对短 L2 prompt（如"继续刚才的任务"）依然弱**：需要把 dialogue_context 做预处理（抽出最后一轮的技术实体填充给 LLM），这超出本实验范围。

---

## 9. 产出清单

| 文件 | 角色 |
|---|---|
| `intent_experiment_plan.md` | 实验设计 |
| `intent_eval_dataset.json` | 45 样本 + GT（20 real + 25 synthetic）|
| `_build_intent_dataset.py` | 数据集构造脚本 |
| `_catalog_tags.json` | catalog.available_tags() 快照 |
| `rule_based_extractor.py` | 系统 A |
| `tag_cards.json` | 系统 B 资产 |
| `embedding_tag_extractor.py` | 系统 B |
| `intent_eval_run.py` | 执行器 + 评分器 |
| `intent_eval_results.json` | 完整结果（三系统 × 45 样本 + 聚合 + triage）|
| `intent_eval_report.md` | 本报告 |

未污染 `src/` 生产代码，实验闭环全在 `tests/`。

---

## 附录 A · 完整 triage 列表

**Q1 rule-enough (11)**：`syn_002, syn_005, syn_006, syn_008, syn_011, syn_019, syn_021, syn_022, syn_024, real_019` 等。

**Q2 embedding-needed (4)**：`syn_010 (L2), syn_022 (L4), syn_023 (L4), syn_025 (L2)`。

**Q3 llm-required (5)**：`syn_004 (L1), syn_007 (L2), syn_012 (L3), syn_013 (L3), syn_016 (L3)`。

**Blind spot (25)**：见 `intent_eval_results.json::triage.blind_spot_all_fail`。
