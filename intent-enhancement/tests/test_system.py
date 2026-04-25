"""
意图识别系统测试用例
"""

import unittest
import json
import tempfile
import shutil
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

from intent_recognition import IntentRecognitionEngine, RecognitionResult
from intent_recognition.parser import ClaudeCodeLogParser
from retrieval import HybridRetrievalEngine, SkillDependencyGraph
from integration import EnhancedSkillResolver
from utils.config import IntentEnhancementConfig, ConfigManager

class TestClaudeCodeLogParser(unittest.TestCase):
    """Claude Code日志解析器测试"""

    def setUp(self):
        """测试准备"""
        self.temp_dir = tempfile.mkdtemp()
        self.parser = ClaudeCodeLogParser(log_directory=self.temp_dir)
    
    def tearDown(self):
        """测试清理"""
        shutil.rmtree(self.temp_dir)
    
    def test_parse_valid_session(self):
        """测试解析有效会话"""
        # 创建测试日志文件
        session_id = "test-session-1"
        log_file = Path(self.temp_dir) / f"{session_id}.jsonl"
        
        log_content = [
            {"type": "user", "uuid": "1", "session_id": session_id, "message": {"role": "user", "content": [{"type": "text", "text": "测试消息"}]}},
            {"type": "assistant", "uuid": "2", "session_id": session_id, "message": {"role": "assistant", "content": [{"type": "text", "text": "助手回复"}]}},
        {"type": "attachment", "session_id": session_id, "attachment": {"type": "file", "filename": "/test/file.md", "content": {"content": "# 测试文件"}}}
        ]
        
        log_file.write_text('\n'.join(json.dumps(line) for line in log_content))
        
        # 解析会话
        session = self.parser.parse_conversation(session_id)
        
        # 验证结果
        self.assertEqual(session.session_id, session_id)
        self.assertEqual(len(session.messages), 2)
        self.assertEqual(len(session.file_references), 1)
    
    def test_parse_file_attachment(self):
        """测试解析文件引用"""
        session_id = "test-session-2"
        log_file = Path(self.temp_dir) / f"{session_id}.jsonl"
        
        log_content = [
            {
                "type": "attachment",
                "session_id": session_id,
                "attachment": {
                    "type": "file",
                    "filename": "/test/config.json",
                    "content": {"content": '{"dependencies": {"react": "^18.0.0"}}'}
                }
            }
        ]
        
        log_file.write_text('\n'.join(json.dumps(line) for line in log_content))
        
        # 解析会话
        session = self.parser.parse_conversation(session_id)
        
        # 验证文件引用解析
        self.assertEqual(len(session.file_references), 1)
        file_ref = session.file_references[0]
        self.assertEqual(file_ref.file_path, "/test/config.json")
        self.assertEqual(file_ref.file_type, "json")
    
    def test_nonexistent_session(self):
        """测试不存在会话"""
        session_id = "nonexistent-session"
        
        with self.assertRaises(FileNotFoundError):
            self.parser.parse_conversation(session_id)
    
    def test_session_caching(self):
        """测试会话缓存"""
        session_id = "test-session-3"
        log_file = Path(self.temp_dir) / f"{session_id}.jsonl"
        
        log_content = [
            {"type": "user", "uuid": "1", "session_id": session_id, "message": {"role": "user", "content": [{"type": "text", "text": "测试缓存"}]}}
        ]
        
        log_file.write_text('\n'.join(json.dumps(line) for line in log_content))
        
        # 第一次解析
        session1 = self.parser.parse_conversation(session_id)
        
        # 第二次解析（应该使用缓存）
        session2 = self.parser.parse_conversation(session_id)
        
        # 验证两次解析结果一致
        self.assertEqual(len(session1.messages), len(session2.messages))
        self.assertEqual(len(session1.file_references), len(session2.file_references))

class TestFileReferenceAnalyzer(unittest.TestCase):
    """文件引用分析器测试"""
    
    def setUp(self):
        from intent_recognition.analyzer import FileReferenceAnalyzer
        self.analyzer = FileReferenceAnalyzer()
    
    def test_tech_stack_detection(self):
        """测试技术栈检测"""
        test_cases = [
            {
                "content": "使用React和TypeScript开发前端应用",
                "expected_stack": {"react", "typescript"}
            },
            {
                "content": "Django项目需要PostgreSQL数据库",
                "expected_stack": {"django", "postgresql"}
            },
            {
                "content": "使用Docker和Kubernetes部署微服务架构",
                "expected_stack": {"docker", "kubernetes"}
            }
        ]
        
        for case in test_cases:
            tech_stack = self.analyzer._detect_tech_stack(case["content"])
            
            # 验证技术栈检测
            for expected_tech in case["expected_stack"]:
                self.assertIn(expected_tech, tech_stack)
    
    def test_file_type_identification(self):
        """测试文件类型识别"""
        test_cases = [
            { "filename": "test.md", "expected_type": "markdown" },
            { "filename": "package.json", "expected_type": "json" },
            { "filename": "main.py", "expected_type": "python" },
            { "filename": "App.tsx", "expected_type": "typescript-react" }
        ]
        
        for case in test_cases:
            file_type = self.analyzer._identify_file_type(case["filename"])
            self.assertEqual(file_type, case["expected_type"])
    
    def test_dependency_extraction(self):
        """测试依赖提取"""
        test_cases = [
            {
                "file_path": "package.json",
                "content": '{"dependencies": {"react": "^18.0.0", "lodash": "^4.17.21"}}',
                "expected_deps": ["react@^18.0.0", "lodash@^4.17.21"]
            },
            {
                "file_path": "requirements.txt",
                "content": "flask==2.0.1\nrequests==2.25.1",
                "expected_deps": ["flask==2.0.1", "requests==2.25.1"]
            }
        ]
        
        for case in test_cases:
            dependencies = self.analyzer._extract_dependencies(case["content"])
            
            for expected_dep in case["expected_deps"]:
                self.assertIn(expected_dep, dependencies)

class TestIntentCompleter(unittest.TestCase):
    """意图补全器测试"""
    
    def setUp(self):
        from intent_recognition.completer import IntentCompleter
        self.completer = IntentCompleter()
    
    def test_discussion_based_completion(self):
        """测试基于讨论的意图补全"""
        # 创建对话上下文
        from intent_recognition.completer import DialogueContext
        dialogue_context = DialogueContext()
        dialogue_context.discussion_points = ["集成Gemini MCP工具"]
        dialogue_context.technical_constraints = ["必须使用免费方案"]
        
        user_input = "好的，按照我们刚才的讨论结果执行吧"
        
        # 补全意图
        enhanced_intent = self.completer.complete_intent(
            user_input, dialogue_context, project_state=None
        )
        
        # 验证补全结果
        self.assertIn("讨论", enhanced_intent.enhanced_intent)
        self.assertEqual(enhanced_intent.intent_type, "discussion_based")
        self.assertGreater(enhanced_intent.confidence, 0.8)
    
    def test_plan_based_completion(self):
        """测试基于计划的意图补全"""
        # 创建对话上下文
        from intent_recognition.completer import DialogueContext, ProjectState
        dialogue_context = DialogueContext()
        project_state = ProjectState()
        project_state.technical_stack = {"django", "react"}
        
        user_input = "按照这个计划文件执行"
        
        # 补全意图
        enhanced_intent = self.completer.complete_intent(
            user_input, dialogue_context, project_state
        )
        
        # 验证补全结果
        self.assertIn("计划", enhanced_intent.enhanced_intent)
        self.assertIn("技术栈", enhanced_intent.enhanced_intent)
        self.assertEqual(enhanced_intent.intent_type, "plan_based")
    
    def test_fallback_completion(self):
        """测试默认处理器"""
        from intent_recognition.completer import DialogueContext, ProjectState
        dialogue_context = DialogueContext()
        project_state = ProjectState()
        
        user_input = "开发一个Python应用"
        
        # 补全意图
        enhanced_intent = self.completer.complete_intent(
            user_input, dialogue_context, project_state
        )
        
        # 验证默认处理
        self.assertEqual(enhanced_intent.original_intent, user_input)
        self.assertEqual(enhanced_intent.intent_type, "general")
        self.assertGreater(enhanced_intent.confidence, 0.0)

class TestHybridRetrievalEngine(unittest.TestCase):
    """混合检索引擎测试"""
    
    def setUp(self):
        self.catalog_data = [
            {
                "name": "django-core",
                "description": "Django项目创建、settings配置、manage.py命令",
                "tech_stack": ["django"],
                "language": ["python"],
                "capability": ["web-framework"]
            },
            {
                "name": "react-core",
                "description": "React项目创建、组件开发、状态管理",
                "tech_stack": ["react"],
                "language": ["javascript"],
                "capability": ["frontend-framework"]
            },
            {
                "name": "postgres-advanced",
                "description": "PostgreSQL高级配置、连接池、性能优化",
                "tech_stack": ["postgresql"],
                "language": ["sql"],
                "capability": ["database"]
            }
        ]
        self.engine = HybridRetrievalEngine(self.catalog_data)
    
    def test_keyword_filter(self):
        """测试关键词过滤"""
        search_result = self.engine.search(
            query="django",
            tech_stack=None,
            capability=None,
            language=None,
            top_n=10
        )
        
        # 验证过滤结果
        self.assertGreater(len(search_result.skills), 0)
        django_skills = [skill for skill in search_result.skills if "django" in skill.name]
        self.assertGreater(len(django_skills), 0)
    
    def test_tech_stack_filter(self):
        """测试技术栈过滤"""
        search_result = self.engine.search(
            query="web",
            tech_stack=["django"],
            capability=None,
            language=None,
            top_n=10
        )
        
        # 验证过滤结果只包含Django技能
        for skill in search_result.skills:
            self.assertIn("django", skill.tech_stack)
    
    def test_cache_functionality(self):
        """测试缓存功能"""
        # 第一次搜索
        result1 = self.engine.search(
            query="react",
            tech_stack=None,
            capability=None,
            language=None,
            top_n=10
        )
        
        # 第二次搜索（应该使用缓存）
        result2 = self.engine.search(
            query="react",
            tech_stack=None,
            capability=None,
            language=None,
            top_n=10
        )
        
        # 验证第二次使用缓存
        self.assertTrue(result2.used_cache)
        self.assertEqual(len(result1.skills), len(result2.skills))
    
    def test_ranking_algorithm(self):
        """测试排序算法"""
        search_result = self.engine.search(
            query="项目",
            tech_stack=None,
            capability=None,
            language=None,
            top_n=10
        )
        
        # 验证排序结果
        scores = [skill.score for skill in search_result.skills]
        self.assertEqual(scores, sorted(scores, reverse=True))

class TestSkillDependencyGraph(unittest.TestCase):
    """技能依赖图测试"""
    
    def setUp(self):
        self.graph = SkillDependencyGraph()
    
    def test_dependency_checking(self):
        """测试依赖检查"""
        # 添加测试依赖
        self.graph.add_dependency('test-core', [])
        self.graph.add_dependency('test-advanced', ['test-core'])
        self.graph.add_dependency('test-auth', ['test-core'])
        
        # 测试缺失依赖
        analysis = self.graph.analyze_dependencies(['test-auth'])
        self.assertIn('test-auth 需要 test-core', analysis.missing_dependencies)
        
        # 测试完整依赖
        analysis = self.graph.analyze_dependencies(['test-core', 'test-advanced'])
        self.assertEqual(len(analysis.missing_dependencies), 0)
    
    def test_conflict_detection(self):
        """测试冲突检测"""
        # 添加测试冲突
        self.graph.add_conflict('framework-a', ['framework-b'])
        self.graph.add_conflict('framework-b', ['framework-a'])
        
        # 测试冲突检测
        analysis = self.graph.analyze_dependencies(['framework-a', 'framework-b'])
        self.assertTrue(analysis.has_conflicts)
        self.assertIn('framework-a 与 framework-b 冲突', analysis.conflict_details)
    
    def test_recommendation_generation(self):
        """测试推荐生成"""
        # 添加测试组合
        self.graph.add_combination('fullstack', ['framework-a', 'database-b', 'cache-c'])
        
        # 测试推荐
        analysis = self.graph.analyze_dependencies(['framework-a', 'database-b'])
        self.assertIn('cache-c', analysis.recommended_skills)
    
    def test_topological_sort(self):
        """测试拓扑排序"""
        # 添加测试依赖
        self.graph.add_dependency('c', ['a', 'b'])
        self.graph.add_dependency('b', ['a'])
        self.graph.add_dependency('d', ['c'])
        
        # 测试拓扑排序
        order = self.graph.get_topological_order(['a', 'b', 'c', 'd'])
        self.assertIn('a', order)
        self.assertLess(order.index('a'), order.index('b'))
        self.assertLess(order.index('b'), order.index('c'))
        self.assertLess(order.index('c'), order.index('d'))

class TestEnhancedSkillResolver(unittest.TestCase):
    """增强技能解析器集成测试"""
    
    def setUp(self):
        # 创建临时技能目录
        self.temp_dir = tempfile.mkdtemp()
        self._create_test_skills()
        
        # 创建解析器
        self.config = IntentEnhancementConfig()
        self.resolver = EnhancedSkillResolver(config=self.config)
        
        # 加载技能目录
        self.resolver.load_skill_catalog(self.temp_dir)
    
    def tearDown(self):
        """测试清理"""
        shutil.rmtree(self.temp_dir)
    
    def _create_test_skills(self):
        """创建测试技能文件"""
        skills = [
            {
                "name": "test-skill-1",
                "description": "测试技能1",
                "tech_stack": ["test-framework"],
                "language": ["test-lang"],
                "capability": ["test-capability"]
            },
            {
                "name": "test-skill-2", 
                "description": "测试技能2",
                "tech_stack": ["test-framework"],
                "language": ["test-lang"],
                "capability": ["test-capability"]
            }
        ]
        
        for i, skill in enumerate(skills, 1):
            skill_dir = Path(self.temp_dir) / f"test-skill-{i}"
            skill_dir.mkdir()
            
            # 创建SKILL.md文件
            skill_file = skill_dir / "SKILL.md"
            content = f"""---
name: {skill['name']}
description: "{skill['description']}"
tech_stack: {skill['tech_stack']}
language: {skill['language']}
capability: {skill['capability']}
---

# 技能内容

这是一个测试技能文件。
"""
            
            skill_file.write_text(content)
    
    def test_basic_resolution(self):
        """测试基础解析"""
        result = self.resolver.resolve(
            user_prompt="测试查询",
            cwd="/test/path",
            conversation_id=None,
            tech_stack=None,
            capability=None,
            language=None,
            top_n=10,
        )

        # 验证基础结果
        self.assertIsNotNone(result.skills)
        self.assertEqual(result.original_intent, "测试查询")
        self.assertGreater(result.confidence, 0.0)

    def test_integrated_resolution(self):
        """测试集成解析（意图识别+检索）"""
        result = self.resolver.resolve(
            user_prompt="测试集成查询",
            cwd="/test/path",
            conversation_id=None,
            tech_stack=None,
            capability=None,
            language=None,
            top_n=10,
        )

        # 验证集成结果
        self.assertIsNotNone(result.skills)
        self.assertGreater(result.confidence, 0.0)
        self.assertGreater(len(result.skills), 0)

    def test_error_handling(self):
        """测试错误处理"""
        # 测试无效的技能目录
        with self.assertRaises(ValueError):
            self.resolver.load_skill_catalog("/invalid/path")

        # 测试空查询处理
        result = self.resolver.resolve(
            user_prompt="",
            cwd="/test/path",
            conversation_id=None,
            tech_stack=None,
            capability=None,
            language=None,
            top_n=10,
        )

        # 应该返回合理的降级结果
        self.assertIsNotNone(result)

class TestConfigManager(unittest.TestCase):
    """配置管理器测试"""
    
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.config_file = Path(self.temp_dir) / "test_config.json"
        self.manager = ConfigManager(str(self.config_file))
    
    def tearDown(self):
        """测试清理"""
        shutil.rmtree(self.temp_dir)
    
    def test_create_default_config(self):
        """测试创建默认配置"""
        config = self.manager.create_default_config()
        
        # 验证默认配置
        self.assertTrue(config.cache.enabled)
        self.assertTrue(config.intent.cache_enabled)
        self.assertTrue(config.retrieval.cache_enabled)
    
    def test_load_save_config(self):
        """测试加载和保存配置"""
        # 创建自定义配置
        custom_config = IntentEnhancementConfig()
        custom_config.cache.ttl = 7200
        custom_config.debug_mode = True

        # 将自定义配置设置到 manager 再保存
        self.manager.config = custom_config
        success = self.manager.save_config()
        self.assertTrue(success)

        # 重新加载配置
        loaded_config = self.manager.get_config()

        # 验证配置持久化
        self.assertEqual(loaded_config.cache.ttl, 7200)
        self.assertTrue(loaded_config.debug_mode)
    
    def test_config_updates(self):
        """测试配置更新"""
        # 更新缓存配置
        updates = {
            'cache': {
                'enabled': False,
                'ttl': 1800
            }
        }
        
        self.manager.update_config(updates)
        
        # 验证更新
        config = self.manager.get_config()
        self.assertFalse(config.cache.enabled)
        self.assertEqual(config.cache.ttl, 1800)

def run_tests():
    """运行所有测试"""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # 添加所有测试类
    suite.addTests(loader.loadTestsFromTestCase(TestClaudeCodeLogParser))
    suite.addTests(loader.loadTestsFromTestCase(TestFileReferenceAnalyzer))
    suite.addTests(loader.loadTestsFromTestCase(TestIntentCompleter))
    suite.addTests(loader.loadTestsFromTestCase(TestHybridRetrievalEngine))
    suite.addTests(loader.loadTestsFromTestCase(TestSkillDependencyGraph))
    suite.addTests(loader.loadTestsFromTestCase(TestEnhancedSkillResolver))
    suite.addTests(loader.loadTestsFromTestCase(TestConfigManager))
    
    # 运行测试
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # 输出测试结果
    print(f"\n{'='*60}")
    print(f"测试结果总结")
    print(f"{'='*60}")
    print(f"运行测试: {result.testsRun}")
    print(f"成功: {len(result.failures)}")
    print(f"失败: {len(result.failures)}")
    print(f"错误: {len(result.errors)}")
    print(f"耗时: {result.duration:.2f}s")
    print(f"{'='*60}")
    
    return result.wasSuccessful()

if __name__ == '__main__':
    success = run_tests()
    exit(0 if success else 1)