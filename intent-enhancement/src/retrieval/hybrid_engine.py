"""
混合检索引擎

结合关键词预过滤、规则匹配、向量检索和LLM分类的多层检索策略
"""

import json
import logging
import os
import re
import time
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Set, Tuple
from dataclasses import dataclass, field
from abc import ABC, abstractmethod

from .query_optimizer import QueryOptimizer, OptimizedQuery
from .embedding_client import OllamaEmbeddingClient, OllamaEmbeddingError
from .embedding_cache import EmbeddingCache

logger = logging.getLogger(__name__)


def _default_cache_db_path() -> Path:
    """embedding 缓存落盘位置：mcp/skill-catalog/.embeddings-cache/embeddings.sqlite。

    通过环境变量 SKILL_CATALOG_EMBEDDING_CACHE_DB 可覆盖（测试用）。
    """
    override = os.environ.get("SKILL_CATALOG_EMBEDDING_CACHE_DB")
    if override:
        return Path(override)
    # 相对本文件定位到 skill-catalog 根：
    #   intent-enhancement/src/retrieval/hybrid_engine.py
    #   → ../../.. 到 claude-config 根
    root = Path(__file__).resolve().parents[3]
    return root / "mcp" / "skill-catalog" / ".embeddings-cache" / "embeddings.sqlite"

@dataclass
class SkillResult:
    """技能搜索结果"""
    name: str
    description: str
    tech_stack: List[str]
    language: List[str]
    capability: List[str]
    score: float
    rank: int
    reason: str = ""
    
@dataclass
class SearchResult:
    """搜索结果"""
    skills: List[SkillResult]
    total_count: int
    query_time: float
    used_cache: bool = False
    enhanced_query: str = ""
    context_used: bool = False
    optimized_query: Optional[OptimizedQuery] = None

class CacheStrategy(ABC):
    """缓存策略抽象基类"""
    
    @abstractmethod
    def get(self, key: str) -> Optional[Any]:
        pass
    
    @abstractmethod
    def set(self, key: str, value: Any, ttl: int = 3600) -> None:
        pass
    
    @abstractmethod
    def delete(self, key: str) -> None:
        pass
    
    @abstractmethod
    def clear(self) -> None:
        pass

class MemoryCache(CacheStrategy):
    """内存缓存"""
    
    def __init__(self):
        self.cache = {}
        self.timestamps = {}
    
    def get(self, key: str) -> Optional[Any]:
        if key in self.cache:
            timestamp = self.timestamps[key]
            if time.time() - timestamp < 3600:  # 1小时TTL
                return self.cache[key]
            else:
                del self.cache[key]
                del self.timestamps[key]
        return None
    
    def set(self, key: str, value: Any, ttl: int = 3600) -> None:
        self.cache[key] = value
        self.timestamps[key] = time.time()
    
    def delete(self, key: str) -> None:
        if key in self.cache:
            del self.cache[key]
            del self.timestamps[key]
    
    def clear(self) -> None:
        self.cache.clear()
        self.timestamps.clear()

class IntelligentCache:
    """智能缓存"""
    
    def __init__(self, cache_strategy: CacheStrategy = None):
        self.cache_strategy = cache_strategy or MemoryCache()
        self.hit_count = 0
        self.miss_count = 0
        
    def get(self, key: str) -> Optional[Any]:
        result = self.cache_strategy.get(key)
        if result:
            self.hit_count += 1
        else:
            self.miss_count += 1
        return result
    
    def set(self, key: str, value: Any, ttl: int = 3600) -> None:
        self.cache_strategy.set(key, value, ttl)
    
    def delete(self, key: str) -> None:
        self.cache_strategy.delete(key)
    
    def clear(self) -> None:
        self.cache_strategy.clear()
    
    def get_hit_rate(self) -> float:
        total = self.hit_count + self.miss_count
        if total == 0:
            return 0.0
        return self.hit_count / total

class VectorStore:
    """向量存储。

    默认 backend = ``ollama`` —— 真实 embedding + SQLite 持久化缓存。
    Ollama 不可达（探活失败 / embedding_client 初始化抛异常）时降级为
    ``hash`` backend：用 MD5 → 384 维 bit 向量保底可用（质量差，但不阻断
    检索链路），与改造前语义等价。
    """

    HASH_DIM = 384

    def __init__(
        self,
        embedding_client: Optional[OllamaEmbeddingClient] = None,
        cache: Optional[EmbeddingCache] = None,
        disable_ollama: bool = False,
    ) -> None:
        self._backend = "hash"
        self._client: Optional[OllamaEmbeddingClient] = None
        self._cache: Optional[EmbeddingCache] = None

        if disable_ollama:
            logger.info("VectorStore: ollama backend disabled by flag, using hash fallback")
            return

        client = embedding_client
        if client is None:
            try:
                client = OllamaEmbeddingClient()
            except Exception as e:  # 构造不应失败，防御
                logger.warning("VectorStore: failed to init OllamaEmbeddingClient: %s", e)
                return

        if not client.ping():
            logger.warning(
                "VectorStore: ollama ping failed at %s, falling back to hash backend",
                client.host_url,
            )
            return

        self._client = client
        try:
            self._cache = cache or EmbeddingCache(
                db_path=_default_cache_db_path(),
                model=client.model,
            )
        except Exception as e:
            logger.warning(
                "VectorStore: failed to init embedding cache (%s), disabling cache but keeping ollama",
                e,
            )
            self._cache = None
        self._backend = "ollama"
        logger.info(
            "VectorStore: ollama backend active (model=%s, host=%s, cache=%s)",
            client.model,
            client.host_url,
            self._cache.db_path if self._cache else "disabled",
        )

    # ---- introspection ------------------------------------------------------

    @property
    def backend(self) -> str:
        return self._backend

    # ---- core API -----------------------------------------------------------

    def create_embedding(self, text: str) -> List[float]:
        """创建文本嵌入。ollama backend 命中缓存时零 HTTP；hash backend 不用缓存。"""
        if self._backend == "ollama":
            cached = self._cache.get(text) if self._cache else None
            if cached is not None:
                return cached
            try:
                vec = self._client.embed(text)  # type: ignore[union-attr]
            except OllamaEmbeddingError as e:
                logger.warning("VectorStore.create_embedding: ollama error (%s), falling back hash for this call", e)
                return self._hash_embedding(text)
            if self._cache:
                try:
                    self._cache.put(text, vec)
                except Exception as e:
                    logger.debug("VectorStore.create_embedding: cache put failed: %s", e)
            return vec
        return self._hash_embedding(text)

    def compute_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """余弦相似度。"""
        if len(vec1) != len(vec2) or not vec1:
            return 0.0

        dot_product = 0.0
        norm1 = 0.0
        norm2 = 0.0
        for a, b in zip(vec1, vec2):
            dot_product += a * b
            norm1 += a * a
            norm2 += b * b

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / ((norm1 ** 0.5) * (norm2 ** 0.5))

    def search_similar(
        self,
        query: str,
        skills: List[Dict[str, Any]],
        top_k: int = 10,
    ) -> List[Tuple[Dict[str, Any], float]]:
        """批量计算 query vs skills 的语义相似度，按分数倒序截 top_k。"""
        if not skills:
            return []

        skill_texts = [self._skill_text(s) for s in skills]

        if self._backend == "ollama":
            query_vec, skill_vecs = self._embed_query_and_skills(query, skill_texts)
        else:
            query_vec = self._hash_embedding(query)
            skill_vecs = [self._hash_embedding(t) for t in skill_texts]

        results: List[Tuple[Dict[str, Any], float]] = []
        for skill, vec in zip(skills, skill_vecs):
            sim = self.compute_similarity(query_vec, vec)
            results.append((skill, sim))
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

    def prewarm(self, skill_catalog_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """主动把 skill_catalog_data 的 embedding 全批量算入缓存。

        hash backend 下 no-op（hash embedding 本身就是 CPU 即算）。
        返回 {"backend", "total", "cached", "computed", "elapsed_s"}。
        """
        t0 = time.monotonic()
        stats = {
            "backend": self._backend,
            "total": len(skill_catalog_data),
            "cached": 0,
            "computed": 0,
            "elapsed_s": 0.0,
        }
        if self._backend != "ollama" or not skill_catalog_data:
            stats["elapsed_s"] = time.monotonic() - t0
            return stats

        texts = [self._skill_text(s) for s in skill_catalog_data]
        # 去重（同一 skill 文本只算一次）
        unique_texts = list(dict.fromkeys(texts))

        hits = self._cache.get_many(unique_texts) if self._cache else {}
        stats["cached"] = len(hits)

        missing = [t for t in unique_texts if t not in hits]
        if missing:
            # 分批提交，避免单次 HTTP payload 过大
            BATCH = 64
            new_items: List[tuple] = []
            for i in range(0, len(missing), BATCH):
                chunk = missing[i : i + BATCH]
                try:
                    vecs = self._client.embed_batch(chunk)  # type: ignore[union-attr]
                except OllamaEmbeddingError as e:
                    logger.warning("VectorStore.prewarm: embed_batch failed at batch %d: %s", i, e)
                    break
                for text, vec in zip(chunk, vecs):
                    new_items.append((text, vec))
            if self._cache and new_items:
                try:
                    self._cache.put_many(new_items)
                except Exception as e:
                    logger.warning("VectorStore.prewarm: cache put_many failed: %s", e)
            stats["computed"] = len(new_items)

        stats["elapsed_s"] = time.monotonic() - t0
        return stats

    # ---- internals ----------------------------------------------------------

    @staticmethod
    def _skill_text(skill: Dict[str, Any]) -> str:
        return f"{skill.get('name', '')} {skill.get('description', '')}".strip()

    def _hash_embedding(self, text: str) -> List[float]:
        hash_value = int(hashlib.md5(text.encode()).hexdigest(), 16)
        return [float((hash_value >> i) & 1) for i in range(self.HASH_DIM)]

    def _embed_query_and_skills(
        self,
        query: str,
        skill_texts: List[str],
    ) -> Tuple[List[float], List[List[float]]]:
        """批量命中缓存 → 计算未命中 → 写回缓存 → 组装向量列表。

        任何 OllamaEmbeddingError 发生时对"未命中"部分整体降级为 hash 向量，
        保持调用方永远拿到 len=len(skill_texts) 的向量列表。
        """
        assert self._client is not None

        # 1. query embedding（单独处理，通常非重复）
        query_vec: Optional[List[float]] = None
        if self._cache:
            query_vec = self._cache.get(query)
        if query_vec is None:
            try:
                query_vec = self._client.embed(query)
                if self._cache:
                    try:
                        self._cache.put(query, query_vec)
                    except Exception:
                        pass
            except OllamaEmbeddingError as e:
                logger.warning("VectorStore: query embed failed (%s), using hash for query", e)
                query_vec = self._hash_embedding(query)

        # 2. skill embeddings 批量
        unique_texts = list(dict.fromkeys(skill_texts))
        hits = self._cache.get_many(unique_texts) if self._cache else {}
        missing = [t for t in unique_texts if t not in hits]

        if missing:
            BATCH = 64
            new_items: List[tuple] = []
            failed = False
            for i in range(0, len(missing), BATCH):
                chunk = missing[i : i + BATCH]
                try:
                    vecs = self._client.embed_batch(chunk)
                except OllamaEmbeddingError as e:
                    logger.warning(
                        "VectorStore: embed_batch failed at offset %d (%s), hash fallback for remainder",
                        i, e,
                    )
                    failed = True
                    break
                for text, vec in zip(chunk, vecs):
                    hits[text] = vec
                    new_items.append((text, vec))
            if self._cache and new_items:
                try:
                    self._cache.put_many(new_items)
                except Exception as e:
                    logger.debug("VectorStore: cache put_many failed: %s", e)
            if failed:
                for t in missing:
                    if t not in hits:
                        hits[t] = self._hash_embedding(t)

        skill_vecs = [hits[t] for t in skill_texts]
        return query_vec, skill_vecs

class RuleEngine:
    """规则引擎"""
    
    def __init__(self):
        self.rules = []
        self._load_default_rules()
    
    def _load_default_rules(self):
        """加载默认规则。

        默认规则列表为空——原先内置的 "tech_stack_rule / project_type_rule /
        action_rule" 把中文关键词（"实现"/"开发"/"项目"）映射到英文 description
        子串（implement / realize / web / frontend / ...），对当前中文为主的
        skill 库会把几乎所有候选过滤成空集（例如"用 Unreal 5 蓝图实现物理碰撞"
        命中 action_rule 后，unreal5 类 skill description 里没有 implement/realize
        英文词，全部被清掉）。真正的标签过滤在 HybridRetrievalEngine._keyword_filter
        层用 tech_stack / capability 闭集做硬过滤就够了；RuleEngine 仅保留
        自定义注入入口（供未来按项目语料追加规则），默认不启用任何规则。
        """
        self.rules = []
    
    def apply_rules(self, query: str, skills: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """应用规则"""
        filtered_skills = skills.copy()
        
        for rule in self.rules:
            if re.search(rule["pattern"], query):
                filtered_skills = rule["action"](re.search(rule["pattern"], query), filtered_skills)
        
        return filtered_skills
    
    def _filter_by_tech_stack(self, tech: str, skills: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """根据技术栈过滤"""
        tech_lower = tech.lower()
        return [skill for skill in skills if tech_lower in skill.get('tech_stack', [])]
    
    def _filter_by_project_type(self, project_type: str, skills: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """根据项目类型过滤"""
        project_type_lower = project_type.lower()
        project_keywords = {
            'web': ['web', 'frontend', 'backend', 'fullstack'],
            'mobile': ['mobile', 'react', 'flutter', 'android', 'ios'],
            'api': ['api', 'backend', 'service'],
            'database': ['database', 'sql', 'mongodb'],
            'cloud': ['cloud', 'aws', 'docker', 'kubernetes']
        }
        
        matched_keywords = []
        for key, keywords in project_keywords.items():
            if key in project_type_lower:
                matched_keywords.extend(keywords)
        
        if not matched_keywords:
            return skills
        
        return [
            skill for skill in skills 
            if any(keyword in skill.get('description', '').lower() for keyword in matched_keywords)
        ]
    
    def _filter_by_action(self, action: str, skills: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """根据动作过滤"""
        action_mapping = {
            '创建': ['create', 'new', 'start'],
            '开发': ['develop', 'build', 'code'],
            '实现': ['implement', 'realize'],
            '构建': ['construct', 'build'],
            '设计': ['design', 'architect']
        }
        
        action_keywords = action_mapping.get(action, [])
        if not action_keywords:
            return skills
        
        return [
            skill for skill in skills 
            if any(keyword in skill.get('description', '').lower() for keyword in action_keywords)
        ]

class HybridRetrievalEngine:
    """混合检索引擎"""
    
    def __init__(self, catalog_data: List[Dict[str, Any]] = None):
        self.catalog_data = catalog_data or []
        self.cache = IntelligentCache()
        self.vector_store = VectorStore()
        self.rule_engine = RuleEngine()
        self.query_optimizer = QueryOptimizer()

        # 预处理技能数据
        self._preprocess_skills()
    
    def _preprocess_skills(self):
        """预处理技能数据"""
        # 为每个技能创建索引
        self.name_index = {}
        self.tech_stack_index = {}
        self.capability_index = {}
        self.language_index = {}
        
        for skill in self.catalog_data:
            name = skill.get('name', '')
            self.name_index[name] = skill
            
            # 技术栈索引
            for tech in skill.get('tech_stack', []):
                if tech not in self.tech_stack_index:
                    self.tech_stack_index[tech] = []
                self.tech_stack_index[tech].append(skill)
            
            # 能力索引
            for capability in skill.get('capability', []):
                if capability not in self.capability_index:
                    self.capability_index[capability] = []
                self.capability_index[capability].append(skill)
            
            # 语言索引
            for lang in skill.get('language', []):
                if lang not in self.language_index:
                    self.language_index[lang] = []
                self.language_index[lang].append(skill)
    
    def search(self, 
               query: str,
               tech_stack: List[str] = None,
               capability: List[str] = None,
               language: List[str] = None,
               top_n: int = 10,
               context: Dict[str, Any] = None) -> SearchResult:
        """
        混合搜索技能
        
        Args:
            query: 搜索查询
            tech_stack: 技术栈过滤
            capability: 能力过滤
            language: 语言过滤
            top_n: 返回结果数量
            context: 上下文信息（用于增强搜索）
            
        Returns:
            SearchResult: 搜索结果
        """
        start_time = time.time()

        # 0. 查询优化与重写（在关键词预过滤之前）
        optimizer_context: Dict[str, Any] = {}
        if context:
            optimizer_context.update(context)
        if tech_stack:
            optimizer_context.setdefault("tech_stack", list(tech_stack))
        optimized = self.query_optimizer.optimize(query, context=optimizer_context or None)
        effective_query = optimized.effective_query or query

        # 生成缓存键（基于优化后的查询，保证缓存一致性）
        cache_key = self._generate_cache_key(effective_query, tech_stack, capability, language)
        
        # 检查缓存
        cached_result = self.cache.get(cache_key)
        if cached_result:
            return SearchResult(
                skills=cached_result,
                total_count=len(cached_result),
                query_time=time.time() - start_time,
                used_cache=True,
                enhanced_query=effective_query,
                context_used=bool(context),
                optimized_query=optimized,
            )

        # 1. 关键词预过滤
        candidates = self._keyword_filter(effective_query, tech_stack, capability, language)

        # 2. 规则匹配
        if context:
            candidates = self._rule_based_filter(effective_query, candidates, context)

        # 3. 排序（含向量语义相似度基底 + 确定性 boost）
        #    _rank_skills 内部直接调 vector_store.search_similar 生成基底分，
        #    无需显式 _vector_search 前置步骤。
        ranked_skills = self._rank_skills(effective_query, candidates, context)
        
        # 限制结果数量
        final_skills = ranked_skills[:top_n]
        
        # 转换为SkillResult
        skill_results = []
        for i, skill in enumerate(final_skills):
            skill_result = SkillResult(
                name=skill.get('name', ''),
                description=skill.get('description', ''),
                tech_stack=skill.get('tech_stack', []),
                language=skill.get('language', []),
                capability=skill.get('capability', []),
                score=skill.get('score', 0.0),
                rank=i + 1,
                reason=skill.get('reason', '')
            )
            skill_results.append(skill_result)
        
        # 缓存结果
        self.cache.set(cache_key, final_skills, ttl=3600)
        
        return SearchResult(
            skills=skill_results,
            total_count=len(final_skills),
            query_time=time.time() - start_time,
            used_cache=False,
            enhanced_query=effective_query,
            context_used=bool(context),
            optimized_query=optimized,
        )
    
    def _generate_cache_key(self, query: str, tech_stack: List[str], 
                          capability: List[str], language: List[str]) -> str:
        """生成缓存键"""
        key_data = {
            'query': query,
            'tech_stack': sorted(tech_stack or []),
            'capability': sorted(capability or []),
            'language': sorted(language or []),
            'timestamp': int(time.time() // 3600)  # 按小时分组
        }
        return hashlib.md5(json.dumps(key_data, sort_keys=True).encode()).hexdigest()
    
    def _keyword_filter(self, query: str, tech_stack: List[str], 
                       capability: List[str], language: List[str]) -> List[Dict[str, Any]]:
        """关键词预过滤"""
        candidates = self.catalog_data.copy()
        
        # 技术栈过滤
        if tech_stack:
            candidates = [
                skill for skill in candidates 
                if any(tech in skill.get('tech_stack', []) for tech in tech_stack)
            ]
        
        # 能力过滤
        if capability:
            candidates = [
                skill for skill in candidates 
                if any(cap in skill.get('capability', []) for cap in capability)
            ]
        
        # 语言过滤
        if language:
            candidates = [
                skill for skill in candidates 
                if any(lang in skill.get('language', []) for lang in language)
            ]
        
        # 文本匹配：OR 而非 AND（至少一个 token 命中 name/description 即保留）。
        # 对中文查询（不依赖空格分词）额外做整串子串匹配。所有 token 都未命中
        # 时不做过滤，保留 tech/capability/language 硬过滤后的候选，交给
        # _rank_skills 打分层处理。
        tokens = [t.lower() for t in query.split() if t.strip()]
        query_lower = query.lower()
        if tokens:
            def _hits(skill):
                name = skill.get('name', '').lower()
                desc = skill.get('description', '').lower()
                if query_lower and (query_lower in name or query_lower in desc):
                    return True
                return any(tok in name or tok in desc for tok in tokens)

            filtered = [s for s in candidates if _hits(s)]
            if filtered:
                candidates = filtered

        return candidates
    
    def _rule_based_filter(self, query: str, candidates: List[Dict[str, Any]], 
                           context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """规则过滤"""
        # 应用内置规则
        candidates = self.rule_engine.apply_rules(query, candidates)
        
        # 应用上下文规则：仅当上下文字段非空时过滤，空列表不视作过滤条件
        # （否则 any([]) 恒假会把所有候选清空）
        context_tech = context.get('technical_stack') or []
        if context_tech:
            candidates = [
                skill for skill in candidates
                if any(tech in skill.get('tech_stack', []) for tech in context_tech)
            ]

        requirements = context.get('requirements') or []
        if requirements:
            candidates = [
                skill for skill in candidates
                if any(req.lower() in skill.get('description', '').lower() for req in requirements)
            ]

        return candidates
    
    def _rank_skills(self, query: str, candidates: List[Dict[str, Any]],
                    context: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """技能排序。

        1. 用 vector_store 产出语义相似度基底（ollama backend 下为真实 embedding
           相似度；hash backend 下为 0—与改造前"_vector_search 未触发"时的
           score 初值语义一致，避免降级路径行为跳变）
        2. 在基底上叠加整串 / token / tech_stack / requirement 等确定性 boost
        """

        # 1. 语义相似度基底
        base_scores: Dict[int, float] = {}
        semantic_reason: Dict[int, str] = {}
        if candidates:
            if self.vector_store.backend == "ollama":
                ranked = self.vector_store.search_similar(query, candidates, top_k=len(candidates))
                for skill, sim in ranked:
                    base_scores[id(skill)] = float(sim)
                    semantic_reason[id(skill)] = f"语义相似度: {sim:.3f}"
            # hash backend：不覆盖已有 score（保持历史行为——多为 0.0）

        query_lower = query.lower()
        # Token-level matching: 对 CJK 长词 split() 输出的整块也能作为 substring
        # 匹配命中；过滤掉长度 <2 的碎屑（"a"、"的"之类），降低误伤。
        query_tokens = [
            t for t in (tok.lower() for tok in query.split() if tok.strip())
            if len(t) >= 2
        ]

        def calculate_score(skill: Dict[str, Any]) -> float:
            # ollama backend：用 base_scores（语义相似度）做基底
            # hash backend：保留 skill.get('score', 0.0)（历史行为）
            if id(skill) in base_scores:
                score = base_scores[id(skill)]
            else:
                score = skill.get('score', 0.0)
            name_lower = skill.get('name', '').lower()
            desc_lower = skill.get('description', '').lower()

            # 整串匹配加分（强信号）
            if query_lower and query_lower in name_lower:
                score += 0.4
            if query_lower and query_lower in desc_lower:
                score += 0.25

            # Token 级匹配加分：对长 query（尤其中英混合）而言，整串几乎不会
            # 出现在 skill 文本里，必须退化到单 token 匹配才能让真实相关的
            # skill 浮到前面。token 出现在 name 视为强信号，出现在 description
            # 视为弱信号。
            for tok in query_tokens:
                if tok in name_lower:
                    score += 0.2
                elif tok in desc_lower:
                    score += 0.08

            # 技术栈匹配加分
            if context and 'technical_stack' in context:
                matching_techs = len(set(skill.get('tech_stack', [])) & set(context['technical_stack']))
                score += matching_techs * 0.1

            # 上下文相关性加分
            if context and 'requirements' in context:
                for req in context['requirements']:
                    if req.lower() in skill.get('description', '').lower():
                        score += 0.05

            return score
        
        # 计算分数并排序
        for skill in candidates:
            skill['score'] = calculate_score(skill)
        
        candidates.sort(key=lambda x: x['score'], reverse=True)
        
        # 添加排序理由
        for i, skill in enumerate(candidates):
            skill['rank'] = i + 1
            if not skill.get('reason'):
                reason = semantic_reason.get(id(skill))
                skill['reason'] = reason if reason else "综合评分"

        return candidates
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """获取缓存统计"""
        return {
            'hit_rate': self.cache.get_hit_rate(),
            'hit_count': self.cache.hit_count,
            'miss_count': self.cache.miss_count
        }
    
    def clear_cache(self):
        """清除缓存"""
        self.cache.clear()
    
    def prewarm(self, skill_catalog_data: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """主动预热 embedding 缓存。

        ollama backend 下：对 skill_catalog_data（默认 self.catalog_data）
        批量算 embedding 并写入 SQLite 缓存，后续检索 HTTP 开销归零。
        hash backend 下：no-op，立即返回。

        不强制启动时调用—MCP server 启动应保持快速；留给 init 脚本或 CLI
        按需触发（避免首次用户请求被批量 embed 拖慢）。
        """
        data = skill_catalog_data if skill_catalog_data is not None else self.catalog_data
        return self.vector_store.prewarm(data)

    def update_catalog(self, new_skills: List[Dict[str, Any]]):
        """更新技能目录"""
        self.catalog_data.extend(new_skills)
        self._preprocess_skills()
        self.clear_cache()  # 清除缓存以使用新数据