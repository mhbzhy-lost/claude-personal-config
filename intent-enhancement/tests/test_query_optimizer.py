"""
QueryOptimizer 单元测试
"""

import sys
import unittest
from pathlib import Path

# 与 test_system.py 保持一致的导入风格：将 src 加入 sys.path
_SRC = Path(__file__).resolve().parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from retrieval import QueryOptimizer, OptimizedQuery, HybridRetrievalEngine


class TestQueryOptimizerNormalize(unittest.TestCase):
    def setUp(self):
        self.qo = QueryOptimizer()

    def test_normalize_strips_and_lowercases(self):
        opt = self.qo.optimize("   Django 项目创建   ")
        self.assertEqual(opt.normalized, "django 项目创建")
        self.assertEqual(opt.original, "   Django 项目创建   ")

    def test_normalize_collapses_whitespace(self):
        opt = self.qo.optimize("create   django\tproject")
        self.assertEqual(opt.normalized, "create django project")

    def test_normalize_fullwidth_to_halfwidth(self):
        opt = self.qo.optimize("ＡＰＩ 接口")
        # NFKC 会把全角英数转半角
        self.assertIn("api", opt.normalized)


class TestQueryOptimizerSynonyms(unittest.TestCase):
    def setUp(self):
        self.qo = QueryOptimizer()

    def test_chinese_to_english_expansion(self):
        opt = self.qo.optimize("我要创建一个项目")
        self.assertIn("project", opt.expanded_keywords)

    def test_english_trigger_expands_chinese(self):
        opt = self.qo.optimize("deploy a frontend app")
        self.assertIn("frontend", opt.expanded_keywords)
        self.assertIn("前端", opt.expanded_keywords)
        self.assertIn("部署", opt.expanded_keywords)


class TestQueryOptimizerPatterns(unittest.TestCase):
    def setUp(self):
        self.qo = QueryOptimizer()

    def test_django_project_pattern(self):
        opt = self.qo.optimize("帮我创建一个django项目")
        self.assertTrue(any("django" in p for p in opt.matched_patterns))
        self.assertIn("django", opt.intent_keywords)
        self.assertIn("startproject", opt.intent_keywords)

    def test_mcp_integration_pattern(self):
        opt = self.qo.optimize("如何集成Gemini MCP")
        self.assertIn("mcp", opt.intent_keywords)
        self.assertIn("integration", opt.intent_keywords)


class TestQueryOptimizerRewrites(unittest.TestCase):
    def setUp(self):
        self.qo = QueryOptimizer()

    def test_vague_rewrite_做网站(self):
        opt = self.qo.optimize("做网站")
        self.assertEqual(opt.rewritten, "web开发 项目创建")
        self.assertIn("web开发", opt.effective_query)

    def test_compound_rewrite_ecommerce(self):
        opt = self.qo.optimize("电商系统")
        # 验证具体重写结果，而非仅断言非 None
        self.assertEqual(opt.rewritten, "项目创建 用户管理 商品系统 支付功能")
        self.assertIn("支付功能", opt.effective_query)

    def test_no_rewrite_for_unknown(self):
        opt = self.qo.optimize("some unrelated query xyz")
        self.assertIsNone(opt.rewritten)


class TestQueryOptimizerContext(unittest.TestCase):
    def setUp(self):
        self.qo = QueryOptimizer()

    def test_context_tech_stack_enhances_keywords(self):
        opt = self.qo.optimize("创建项目", context={"tech_stack": ["Django", "PostgreSQL"]})
        self.assertTrue(opt.context_used)
        self.assertIn("django", opt.expanded_keywords)
        self.assertIn("postgresql", opt.expanded_keywords)

    def test_context_none_no_flag(self):
        opt = self.qo.optimize("创建项目", context=None)
        self.assertFalse(opt.context_used)


class TestQueryOptimizerBoundary(unittest.TestCase):
    """边界条件：空查询、纯标点、空 context dict、effective_query 属性。"""

    def setUp(self):
        self.qo = QueryOptimizer()

    def test_empty_string_query(self):
        """空字符串不应抛出异常，normalized 应为空串。"""
        opt = self.qo.optimize("")
        self.assertEqual(opt.original, "")
        self.assertEqual(opt.normalized, "")
        self.assertEqual(opt.expanded_keywords, [])
        self.assertIsNone(opt.rewritten)
        self.assertEqual(opt.effective_query, "")

    def test_whitespace_only_query(self):
        """仅含空白的查询经标准化后应等同于空串。"""
        opt = self.qo.optimize("   \t  ")
        self.assertEqual(opt.normalized, "")

    def test_punctuation_only_query(self):
        """仅含标点的查询不应触发同义词/模式，不应崩溃。"""
        opt = self.qo.optimize("！？。、…")
        self.assertFalse(opt.context_used)
        # 不会崩溃，且 intent_keywords 应为空
        self.assertEqual(opt.intent_keywords, [])

    def test_empty_context_dict_is_not_used(self):
        """空 dict context 不应将 context_used 置为 True（无实质关键词）。"""
        opt = self.qo.optimize("创建项目", context={})
        self.assertFalse(opt.context_used)

    def test_effective_query_uses_rewrite_when_available(self):
        """命中重写规则时，effective_query 应以重写结果为基础。"""
        opt = self.qo.optimize("做网站")
        self.assertTrue(opt.effective_query.startswith("web开发"))

    def test_effective_query_falls_back_to_normalized(self):
        """无重写规则命中时，effective_query 以 normalized 为基础。"""
        opt = self.qo.optimize("some query")
        self.assertIsNone(opt.rewritten)
        self.assertIn("some", opt.effective_query)

    def test_custom_synonyms_override(self):
        """构造器可传入自定义 synonyms，应覆盖类级默认值。"""
        qo = QueryOptimizer(synonyms={"框架": ["framework", "lib"]}, patterns={}, query_rewrites={})
        opt = qo.optimize("推荐一个框架")
        self.assertIn("framework", opt.expanded_keywords)
        # 默认同义词不应出现（项目 → project 之类）
        self.assertNotIn("project", opt.expanded_keywords)

    def test_context_technical_stack_key(self):
        """context 支持 technical_stack 键（与 tech_stack 并列）。"""
        opt = self.qo.optimize("项目", context={"technical_stack": ["FastAPI"]})
        self.assertTrue(opt.context_used)
        self.assertIn("fastapi", opt.expanded_keywords)


class TestHybridEngineIntegration(unittest.TestCase):
    """接入 QueryOptimizer 后 HybridRetrievalEngine 的回归测试。"""

    def setUp(self):
        self.catalog = [
            {
                "name": "django-core",
                "description": "Django项目创建、settings配置、manage.py命令",
                "tech_stack": ["django"],
                "language": ["python"],
                "capability": ["web-framework"],
            },
            {
                "name": "react-core",
                "description": "React项目创建、组件开发",
                "tech_stack": ["react"],
                "language": ["javascript"],
                "capability": ["frontend-framework"],
            },
        ]
        self.engine = HybridRetrievalEngine(self.catalog)

    def test_search_returns_optimized_query(self):
        result = self.engine.search(query="django", top_n=5)
        self.assertIsNotNone(result.optimized_query)
        self.assertIsInstance(result.optimized_query, OptimizedQuery)
        self.assertEqual(result.optimized_query.original, "django")

    def test_search_still_returns_results(self):
        result = self.engine.search(query="Django", top_n=5)
        # 优化器会小写化，预过滤仍应命中 django-core
        names = [s.name for s in result.skills]
        self.assertIn("django-core", names)

    def test_empty_query_does_not_crash(self):
        """空查询不应使引擎崩溃，结果可为空列表。"""
        result = self.engine.search(query="", top_n=5)
        self.assertIsInstance(result.skills, list)

    def test_optimized_query_original_preserved_in_search(self):
        """SearchResult.optimized_query.original 应保留调用者传入的原始字符串。"""
        result = self.engine.search(query="  Django  ", top_n=5)
        self.assertEqual(result.optimized_query.original, "  Django  ")


if __name__ == "__main__":
    unittest.main()
