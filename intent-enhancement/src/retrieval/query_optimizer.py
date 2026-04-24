"""
查询优化与重写模块

提供 QueryOptimizer 用于在混合检索之前对用户原始查询进行标准化、
同义词扩展、模式匹配和查询重写，并在可选上下文（技术栈、文件上下文等）
辅助下进一步补强关键词。

设计参考：docs/plans/skill-retrieval-optimization.md § 3.4
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Pattern


@dataclass
class OptimizedQuery:
    """查询优化结果。

    Attributes:
        original: 用户原始输入（未做任何处理）。
        normalized: 标准化后的查询字符串（去空白、小写、全角转半角）。
        expanded_keywords: 同义词扩展 + 上下文增强后的关键词列表（去重、保序）。
        matched_patterns: 命中的正则模式对应的意图标签列表。
        intent_keywords: 根据模式匹配与重写推断出的意图关键词。
        rewritten: 若命中 QUERY_REWRITES，则给出的重写查询；否则为 None。
        context_used: 是否使用了外部 context。
    """

    original: str
    normalized: str
    expanded_keywords: List[str] = field(default_factory=list)
    matched_patterns: List[str] = field(default_factory=list)
    intent_keywords: List[str] = field(default_factory=list)
    rewritten: Optional[str] = None
    context_used: bool = False

    @property
    def effective_query(self) -> str:
        """返回送入下游检索的最终查询串（优先使用重写结果）。"""
        base = self.rewritten if self.rewritten else self.normalized
        extras = " ".join(k for k in self.expanded_keywords if k and k not in base)
        return (base + " " + extras).strip() if extras else base


class QueryOptimizer:
    """查询优化器。

    以类属性暴露 synonyms / patterns / query_rewrites 三类可扩展数据，
    调用 `optimize(query, context)` 得到 `OptimizedQuery`。
    """

    # --- 可扩展的数据属性 ---

    synonyms: Dict[str, List[str]] = {
        "项目": ["project", "app", "应用"],
        "api": ["接口", "endpoint", "服务"],
        "数据库": ["db", "database", "存储"],
        "前端": ["frontend", "client", "ui"],
        "后端": ["backend", "server", "api"],
        "认证": ["auth", "authentication", "登录"],
        "部署": ["deploy", "deployment", "发布"],
        "测试": ["test", "testing", "单测", "集成测试"],
    }

    # pattern_str -> intent tags
    patterns: Dict[str, List[str]] = {
        r"创建.*django.*项目": ["django", "startproject"],
        r"集成.*支付.*功能": ["payment", "integration"],
        r"用户.*认证": ["auth", "authentication"],
        r"集成.*mcp": ["mcp", "integration"],
        r"部署.*(docker|k8s|kubernetes)": ["deploy", "container"],
        r"写.*测试|单元测试|集成测试": ["test", "testing"],
    }

    query_rewrites: Dict[str, str] = {
        # 模糊查询精确化
        "做网站": "web开发 项目创建",
        "写app": "mobile应用 开发",
        "连数据库": "数据库 连接 配置",
        # 技术栈明确化
        "django页面": "django 视图 模板",
        "react组件": "react 组件 开发",
        "登录功能": "用户认证 登录 注册",
        # 复合需求分解
        "电商系统": "项目创建 用户管理 商品系统 支付功能",
        "博客系统": "项目创建 文章管理 用户评论",
    }

    def __init__(
        self,
        synonyms: Optional[Dict[str, List[str]]] = None,
        patterns: Optional[Dict[str, List[str]]] = None,
        query_rewrites: Optional[Dict[str, str]] = None,
    ) -> None:
        # 允许在实例级覆盖类级默认值（浅拷贝，避免共享修改）
        if synonyms is not None:
            self.synonyms = dict(synonyms)
        else:
            self.synonyms = dict(self.__class__.synonyms)

        if patterns is not None:
            self.patterns = dict(patterns)
        else:
            self.patterns = dict(self.__class__.patterns)

        if query_rewrites is not None:
            self.query_rewrites = dict(query_rewrites)
        else:
            self.query_rewrites = dict(self.__class__.query_rewrites)

        # 预编译正则
        self._compiled_patterns: List[tuple[Pattern[str], List[str]]] = [
            (re.compile(p, re.IGNORECASE), tags)
            for p, tags in self.patterns.items()
        ]

    # --- 主入口 ---

    def optimize(
        self, query: str, context: Optional[Dict[str, Any]] = None
    ) -> OptimizedQuery:
        """对查询进行标准化、同义词扩展、模式匹配与重写。

        Args:
            query: 用户原始查询。
            context: 可选上下文，可能包含 `tech_stack` / `file_context` /
                `technical_stack` / `requirements` 等键。

        Returns:
            OptimizedQuery 实例。
        """
        original = query or ""
        normalized = self._normalize(original)

        # 1. 同义词扩展
        expanded = self._expand_synonyms(normalized)

        # 2. 模式匹配 -> intent keywords
        matched_patterns, intent_keywords = self._match_patterns(normalized)

        # 3. 查询重写
        rewritten = self._rewrite(normalized)

        # 4. 上下文增强
        context_used = False
        if context:
            ctx_keywords = self._enhance_with_context(context)
            if ctx_keywords:
                context_used = True
                for kw in ctx_keywords:
                    if kw and kw not in expanded:
                        expanded.append(kw)

        # 合并 intent_keywords 到扩展关键词（去重保序）
        for kw in intent_keywords:
            if kw and kw not in expanded:
                expanded.append(kw)

        return OptimizedQuery(
            original=original,
            normalized=normalized,
            expanded_keywords=expanded,
            matched_patterns=matched_patterns,
            intent_keywords=intent_keywords,
            rewritten=rewritten,
            context_used=context_used,
        )

    # --- 内部步骤 ---

    @staticmethod
    def _normalize(text: str) -> str:
        """标准化：Unicode NFKC（全角->半角）+ 小写 + 折叠空白。"""
        if not text:
            return ""
        t = unicodedata.normalize("NFKC", text)
        t = t.strip().lower()
        t = re.sub(r"\s+", " ", t)
        return t

    def _expand_synonyms(self, normalized: str) -> List[str]:
        """基于词典展开同义词。返回去重保序的关键词列表（含原 token）。"""
        tokens: List[str] = []
        # 以空白切分保留基础 token
        for tok in normalized.split():
            if tok and tok not in tokens:
                tokens.append(tok)

        # 针对 synonyms 表：无论 key 以什么语言出现，只要子串命中，就加入其所有同义词
        for key, alts in self.synonyms.items():
            key_l = key.lower()
            if key_l in normalized:
                if key_l not in tokens:
                    tokens.append(key_l)
                for alt in alts:
                    alt_l = alt.lower()
                    if alt_l not in tokens:
                        tokens.append(alt_l)
            else:
                # 反向：若 normalized 命中任一 alt，也把 key 和其他 alt 拉进来
                for alt in alts:
                    if alt.lower() in normalized:
                        if key_l not in tokens:
                            tokens.append(key_l)
                        for other in alts:
                            o_l = other.lower()
                            if o_l not in tokens:
                                tokens.append(o_l)
                        break
        return tokens

    def _match_patterns(self, normalized: str) -> tuple[List[str], List[str]]:
        """匹配正则，返回（命中模式字符串列表，扁平化的意图关键词列表）。"""
        matched: List[str] = []
        intent_keywords: List[str] = []
        for compiled, tags in self._compiled_patterns:
            if compiled.search(normalized):
                matched.append(compiled.pattern)
                for tag in tags:
                    if tag not in intent_keywords:
                        intent_keywords.append(tag)
        return matched, intent_keywords

    def _rewrite(self, normalized: str) -> Optional[str]:
        """若 normalized 完全匹配或包含某个重写 key，返回重写文本。

        优先采用精确匹配；否则选择第一个作为子串出现的 key（按长度降序）。
        """
        if not normalized:
            return None
        if normalized in self.query_rewrites:
            return self.query_rewrites[normalized]
        # 子串匹配：长 key 优先，避免 "登录" 抢先命中
        for key in sorted(self.query_rewrites, key=len, reverse=True):
            if key and key in normalized:
                return self.query_rewrites[key]
        return None

    @staticmethod
    def _enhance_with_context(context: Dict[str, Any]) -> List[str]:
        """从 context 中提取辅助关键词。

        支持的键：tech_stack / technical_stack / file_context /
        requirements / existing_skills。值为字符串或字符串列表。
        """
        out: List[str] = []

        def _collect(v: Any) -> None:
            if v is None:
                return
            if isinstance(v, str):
                if v.strip():
                    out.append(v.strip().lower())
            elif isinstance(v, (list, tuple, set)):
                for item in v:
                    _collect(item)
            elif isinstance(v, dict):
                for item in v.values():
                    _collect(item)

        for key in (
            "tech_stack",
            "technical_stack",
            "file_context",
            "requirements",
            "existing_skills",
        ):
            if key in context:
                _collect(context[key])

        # 去重保序
        seen: List[str] = []
        for item in out:
            if item and item not in seen:
                seen.append(item)
        return seen
