# IntentFallback 设计文档

> 目的：用 **rule + embedding** 的本地合成兜底替换 qwen2.5:7b classifier。
> 兜底触发：`resolve` 入参 `tech_stack` 与 `capability` 均为空时（主 agent 预 hook 已硬约束，正常路径永不触发；此兜底仅覆盖 CLI / subagent tag 注入失败降级 / 未来程序化调用方）。

## 1. 位置决策

**选定位置：`mcp/skill-catalog/src/skill_catalog/intent_fallback.py`**

权衡过的三个选项：

| 选项 | 位置 | 否决理由 |
|---|---|---|
| A（选中） | `mcp/skill-catalog/src/skill_catalog/intent_fallback.py`，把 `OllamaEmbeddingClient` 轻量 inline 到 skill-catalog 内 | 无 |
| B | `intent-enhancement/src/integration/intent_fallback.py`，skill-catalog dynamic import | `ENABLE_INTENT_ENHANCEMENT=false` 场景 intent-enhancement src 未注入 sys.path，import 会失败——而 fallback 必须在该场景工作（pipeline.py 现有 classifier 本就是 stdlib-only 自足模块，fallback 不能倒退） |
| C | 同 A，但 `from retrieval.embedding_client import ...` 复用 intent-enhancement 模块 | 引入与 B 同样的硬依赖循环；且 skill-catalog 长期应自有一份 Ollama client（qwen classifier 本就走独立 stdlib http.client） |

资产文件（tag cards）放 `mcp/skill-catalog/data/tag_cards.json`：
- 与 skill-catalog 包平级（不是 Python 模块）
- 通过 `importlib.resources` 或 `Path(__file__).parents[N]/data/...` 定位
- 作为"第二份闭集"，与 `catalog.available_tags()` 做校验（缺卡 fallback 到 tag 本名）

## 2. 架构

```
IntentFallback.classify(user_prompt, fingerprint_summary, available_tech_stack, available_capability)
    → rule_hits: set[tag]              # 高精度层（零 HTTP，~ms 级）
    → embedding_hits: set[tag]         # 高召回层（首次 build_index 后命中缓存）
    → merged = rule_hits ∪ embedding_hits  # union 融合
    → 按 available_* 过滤 + 去重 + 稳定排序
    → 返回 ClassifyResult（与现有 Classifier 等价 schema）
```

### 2.1 合成策略：Rule ∪ Embedding（不做 gating）

权衡过的三个合成方式：

1. **纯 union**（选中）：rule 和 embedding 独立跑，结果取并集
   - 优点：rule 高 precision 贡献强信号 tag；embedding 高 recall 补冷门 / 同义 tag
   - 适合 fallback 场景——宁可 over-tag 一点（filter 阶段本就是"匹配任一就保留"），少漏 tag
2. **串行 gate**（否决）：rule 无命中再走 embedding
   - 否决：rule 本来就不可能覆盖全部 85 tag × 表达方式，rule 命中 1 个 tag 不意味着不需要 embedding 补其他
3. **加权融合 per-tag**（否决）：score = α·rule + β·cosine，全局 θ
   - 否决：rule 是 0/1 二值信号，与 cosine 连续值量纲不同；调参面多一倍；fallback 不需要这么精细

**边界 case 覆盖**：
- rule 命中 0 条 + embedding 失败 → 返回空（与 qwen timeout 同语义）
- rule 命中 N 条 + embedding 失败 → 返回 rule 结果（降级可用）
- embedding 返回但分数都低于 θ → 只用 rule
- 命中 tag 不在 `available_*` 闭集 → 过滤掉（与 Classifier 的 allowed set 语义一致）

### 2.2 阈值策略：全局 θ，tech/cap 分开

- 沿用现有原型的 grid search 结果（`grid_search_threshold` 在样本上选 F1 最优）
- 生产化后固化 `tech_threshold` / `cap_threshold` 两个常数到 `intent_fallback.py` 顶部（从 regression 脚本选）
- 不做 per-tag θ：45 条样本不足以 per-tag 调参，过拟合风险大
- 未来若 catalog 规模扩到 200+ tag 再考虑 per-tag 或 top-k cutoff

### 2.3 Embedding 缓存策略

**冷启动一次，磁盘缓存 per (catalog_tags_hash, embedding_model)**：

```
~/.cache/skill-catalog/tag_card_embeddings.json
{
  "tags_hash": "<sha256 of sorted(tech)+sorted(cap) + tag_cards_mtime>",
  "model": "bge-m3",
  "dimension": 1024,
  "tech_stack": {"react": [0.12, ...], ...},
  "capability": {"ui-form": [0.34, ...], ...}
}
```

- 命中：直接 load，零 HTTP
- Miss（tag 集变 / tag_cards.json 修改 / 换模型）：rebuild 所有 tag card embedding，写回
- query embedding 不缓存（每次都是新 prompt，缓存无意义；单次 HTTP ~ 10-50ms 可接受）

**tags_hash 计算**：不能只 hash 标签名——tag card 内容修改也必须触发 rebuild。组合：
`sha256( json.dumps({"tech": sorted(tech), "cap": sorted(cap), "cards_mtime": <float>}, sort_keys=True) )`

### 2.4 Fail-soft 对齐

与现有 `Classifier.classify` 语义严格等价：

- embedding HTTP 失败 → `ClassifyResult(tech_stack=rule_hits, capability=rule_cap_hits, error="embedding: <msg>")`（部分结果 + error 记录）
- rule 不会失败（纯正则，抛异常代表 bug 不吞）
- tag card 文件缺失 → 构造期抛，不吞（部署问题应立即暴露，不应 silent 全空）

ClassifyResult dataclass **直接复用** `skill_catalog.classifier.ClassifyResult`，避免双定义漂移。

## 3. Rule 层升级点（相比 tests/rule_based_extractor.py 原型）

1. **大小写归一 + 空格归一**：`text.lower()` 后再 search；多空格折叠
2. **保持 allowlist 过滤**：构造期根据 `available_tech_stack/capability` 过滤 rule book（动态输入来自 catalog，不同项目 catalog 可能调整）
3. **词边界规则保留**：短 token（≤6 字符纯 ASCII）用 `\b...\b` 防误命中（如 `ios` 不应命中 "kiosk"）
4. **合并 rule book**：在原型基础上补全 catalog 当前 108 个 tech_stack + 64 个 capability（目前原型只覆盖约 70%）——缺失 tag 由 embedding 兜底，不强求 rule 全覆盖
5. **pattern 构造缓存**：每次 classify 调用不重编译；instance 构造时 compile 一次

## 4. 生产 tag_cards.json 资产

### 4.1 Schema

```json
{
  "version": 1,
  "tech_stack": {
    "<tag>": "<1-3 句自然语言扩展：框架身份 + 典型组件/概念>"
  },
  "capability": {
    "<tag>": "<同上>"
  }
}
```

### 4.2 覆盖目标

- 必须覆盖 `catalog.available_tags()` 返回的全部 tech_stack + capability
- 缺失 tag：fallback 到 tag 本名作为 card（embedding_tag_extractor 已有此逻辑）
- 新增 tag 流程：贡献者在 distillation 阶段提交新 tag 时，**同步在 tag_cards.json 补卡**（加入 skill-distillation.md checklist）

### 4.3 资产迁移动作

1. 从 `intent-enhancement/tests/tag_cards.json` copy 到 `mcp/skill-catalog/data/tag_cards.json`
2. diff `_catalog_tags.json` 和 `tag_cards.json` 的 tag 集合，补齐缺失 tag（本轮发现 web / webvtt / wechat / wechat-miniprogram / wechat-pay / widevine / x-twitter / xiaomi-account / xmpp / yahoo / vivo-account / taobao-top / trivy / playwright / socketio / signal / structlog / crypto / jd-miniprogram / instagram-platform / meta-graph-api / cn-platform-oauth-login / honor-id / microsoft-entra / netease-urs / baidu-oauth / amazon-lwa / hms-core 等部分已存在；capability 现 agent-orchestration 缺卡）
3. 再加 `version: 1` 顶层字段；schema 演进时 bump

## 5. 对外接口

```python
# mcp/skill-catalog/src/skill_catalog/intent_fallback.py

@dataclass(frozen=True)
class IntentFallbackConfig:
    tag_cards_path: Path
    embedding_host_url: str = "http://127.0.0.1:11435"
    embedding_model: str = "bge-m3"
    tech_threshold: float = 0.45   # from regression grid-search
    cap_threshold: float = 0.45
    cache_dir: Path = Path.home() / ".cache" / "skill-catalog"
    embedding_timeout_s: float = 10.0

class IntentFallback:
    def __init__(self, config: IntentFallbackConfig) -> None: ...

    # Signature binary-compatible with Classifier.classify → drop-in replacement
    def classify(
        self,
        user_prompt: str,
        fingerprint_summary: str,
        available_tech_stack: list[str],
        available_capability: list[str],
    ) -> ClassifyResult: ...
```

注意：`ClassifyResult` 从 `classifier.py` 顶格 re-export（保持单一事实源）。

## 6. Pipeline 接入

`pipeline.py` 与 `intent_enhanced_resolver.py` 的 `self._classifier` 改为 `IntentFallback` 实例——duck typing 兼容（只要有 `.classify(...)`）。`Classifier` 文件顶端加 deprecation notice + 仍在 codebase 但不再被实例化。

`cli.py` 和 `server.py` 的 `_build_classifier()` → `_build_intent_fallback()`（保留参数名 `classifier` 在 pipeline 接口以最小改动）。

## 7. 反向验证：3 个月后最先崩在哪？

- **最脆弱环节**：tag_cards.json 与 catalog tag 集漂移。新 tag 入库但没补卡 → embedding 仍降级到 tag 名本身做 embedding，召回会在该 tag 上偏低
- **缓解**：
  1. `IntentFallback` 构造期打 warning：log 出所有 "tag 在 catalog 但无 card" 的 tag 名字
  2. 让 `skill-distillation.md` checklist 里加一条"新 tag 需补 tag_cards.json"
- **次脆弱**：embedding 缓存 schema 向前兼容——`tags_hash` 方案已自动失效 stale，这一点稳

## 8. 不做的事（本批次 scope 外）

- 不删 `classifier.py`（保留为 dead code + deprecation comment）
- 不动 hooks / settings.json / init_claude.sh
- 不改 `ENABLE_INTENT_ENHANCEMENT` 语义（intent-enhancement 增强路径仍独立）
- 不卸 Ollama qwen2.5:7b 模型
