"""
混合检索引擎

结合关键词预过滤、规则匹配、向量检索和LLM分类的多层检索策略
"""

import json
import time
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Set, Tuple
from dataclasses import dataclass, field
from abc import ABC, abstractmethod

from .query_optimizer import QueryOptimizer, OptimizedQuery

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
    """向量存储（简化实现）"""
    
    def __init__(self):
        self.embeddings = {}
        self.skill_embeddings = {}
        
    def create_embedding(self, text: str) -> List[float]:
        """创建文本嵌入（简化版本）"""
        # 这里应该使用真实的嵌入模型，如sentence-transformers
        # 为了演示，我们使用简单的hash特征
        hash_value = int(hashlib.md5(text.encode()).hexdigest(), 16)
        # 生成固定长度的向量
        embedding = []
        for i in range(384):  # 384维向量
            embedding.append((hash_value >> i) & 1)
        return embedding
    
    def compute_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """计算余弦相似度"""
        if len(vec1) != len(vec2):
            return 0.0
        
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = sum(a * a for a in vec1) ** 0.5
        norm2 = sum(a * a for a in vec2) ** 0.5
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)
    
    def search_similar(self, query: str, skills: List[Dict[str, Any]], top_k: int = 10) -> List[Tuple[Dict[str, Any], float]]:
        """搜索相似技能"""
        query_embedding = self.create_embedding(query)
        results = []
        
        for skill in skills:
            skill_text = f"{skill.get('name', '')} {skill.get('description', '')}"
            skill_embedding = self.create_embedding(skill_text)
            
            similarity = self.compute_similarity(query_embedding, skill_embedding)
            results.append((skill, similarity))
        
        # 按相似度排序
        results.sort(key=lambda x: x[1], reverse=True)
        
        return results[:top_k]

class RuleEngine:
    """规则引擎"""
    
    def __init__(self):
        self.rules = []
        self._load_default_rules()
    
    def _load_default_rules(self):
        """加载默认规则"""
        self.rules = [
            {
                "name": "tech_stack_rule",
                "pattern": r"使用(.+)",
                "action": lambda match, skills: self._filter_by_tech_stack(match.group(1), skills)
            },
            {
                "name": "project_type_rule",
                "pattern": r"(.+)项目",
                "action": lambda match, skills: self._filter_by_project_type(match.group(1), skills)
            },
            {
                "name": "action_rule",
                "pattern": r"(创建|开发|实现|构建|设计)",
                "action": lambda match, skills: self._filter_by_action(match.group(1), skills)
            }
        ]
    
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

        # 3. 向量检索
        if context and len(candidates) > 5:
            candidates = self._vector_search(effective_query, candidates, top_n * 2)

        # 4. 排序和筛选
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
        
        # 文本匹配
        query_lower = query.lower()
        for keyword in query.split():
            keyword_lower = keyword.lower()
            candidates = [
                skill for skill in candidates
                if keyword_lower in skill.get('name', '').lower() or 
                   keyword_lower in skill.get('description', '').lower()
            ]
        
        return candidates
    
    def _rule_based_filter(self, query: str, candidates: List[Dict[str, Any]], 
                           context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """规则过滤"""
        # 应用内置规则
        candidates = self.rule_engine.apply_rules(query, candidates)
        
        # 应用上下文规则
        if 'technical_stack' in context:
            context_tech = context['technical_stack']
            candidates = [
                skill for skill in candidates
                if any(tech in skill.get('tech_stack', []) for tech in context_tech)
            ]
        
        if 'requirements' in context:
            requirements = context['requirements']
            candidates = [
                skill for skill in candidates
                if any(req.lower() in skill.get('description', '').lower() for req in requirements)
            ]
        
        return candidates
    
    def _vector_search(self, query: str, candidates: List[Dict[str, Any]], 
                      top_k: int) -> List[Dict[str, Any]]:
        """向量检索"""
        results = self.vector_store.search_similar(query, candidates, top_k)
        
        # 为结果添加分数
        for skill, similarity in results:
            skill['score'] = similarity
            skill['reason'] = f"语义相似度: {similarity:.3f}"
        
        return [skill for skill, _ in results]
    
    def _rank_skills(self, query: str, candidates: List[Dict[str, Any]], 
                    context: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """技能排序"""
        
        def calculate_score(skill: Dict[str, Any]) -> float:
            score = skill.get('score', 0.0)
            
            # 名称匹配加分
            if query.lower() in skill.get('name', '').lower():
                score += 0.3
            
            # 描述匹配加分
            if query.lower() in skill.get('description', '').lower():
                score += 0.2
            
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
                skill['reason'] = "综合评分"
        
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
    
    def update_catalog(self, new_skills: List[Dict[str, Any]]):
        """更新技能目录"""
        self.catalog_data.extend(new_skills)
        self._preprocess_skills()
        self.clear_cache()  # 清除缓存以使用新数据