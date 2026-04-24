#!/usr/bin/env python3
"""
意图增强技能检索系统 - 集成测试脚本
"""

import sys
import os
import time
import json
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root / "src"))

from intent_recognition import IntentRecognitionEngine
from retrieval import HybridRetrievalEngine, SkillDependencyGraph
from integration import EnhancedSkillResolver, get_monitor
from utils.config import get_config_manager, get_config

def test_basic_functionality():
    """测试基础功能"""
    print("="*60)
    print("测试基础功能")
    print("="*60)
    
    try:
        # 1. 测试配置管理
        print("\n1. 测试配置管理...")
        config = get_config()
        print(f"✓ 配置加载成功")
        print(f"  - 缓存启用: {config.cache.enabled}")
        print(f"  - 意图识别启用: {config.intent.cache_enabled}")
        
        # 2. 测试依赖图
        print("\n2. 测试技能依赖图...")
        dep_graph = SkillDependencyGraph()
        
        # 测试依赖检查
        analysis = dep_graph.analyze_dependencies(['django-drf'])
        print(f"✓ 依赖分析成功")
        print(f"  - 缺失依赖: {len(analysis.missing_dependencies)}")
        print(f"  - 推荐技能: {len(analysis.recommended_skills)}")
        
        # 3. 测试混合检索
        print("\n3. 测试混合检索...")
        catalog_data = [
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
            }
        ]
        
        retrieval_engine = HybridRetrievalEngine(catalog_data)
        result = retrieval_engine.search("django", top_n=5)
        
        print(f"✓ 检索成功")
        print(f"  - 找到技能: {len(result.skills)}")
        print(f"  - 使用缓存: {result.used_cache}")
        print(f"  - 查询时间: {result.query_time:.3f}s")
        
        return True
        
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_intent_recognition():
    """测试意图识别"""
    print("\n" + "="*60)
    print("测试意图识别")
    print("="*60)
    
    try:
        # 创建测试日志
        test_log_dir = Path(__file__).parent / "test_data" / "logs"
        test_log_dir.mkdir(parents=True, exist_ok=True)
        
        # 创建测试会话日志
        session_id = "test-session-123"
        log_file = test_log_dir / f"{session_id}.jsonl"
        
        test_logs = [
            {"type": "user", "uuid": "1", "session_id": session_id, "message": {"role": "user", "content": [{"type": "text", "text": "我需要集成Gemini MCP工具到项目中"}]}},
            {"type": "assistant", "uuid": "2", "session_id": session_id, "message": {"role": "assistant", "content": [{"type": "text", "text": "好的，我们来讨论一下技术方案"}]}},
            {"type": "user", "uuid": "3", "session_id": session_id, "message": {"role": "user", "content": [{"type": "text", "text": "我们决定使用jamubc/gemini-mcp-tool，并且需要创建skill文档"}]}},
            {"type": "assistant", "uuid": "4", "session_id": session_id, "message": {"role": "assistant", "content": [{"type": "text", "text": "明白了，按照讨论结果，我们将使用jamubc/gemini-mcp-tool"}]}}
        ]
        
        log_file.write_text('\n'.join(json.dumps(log) for log in test_logs))
        
        # 测试意图识别引擎
        intent_engine = IntentRecognitionEngine(log_directory=str(test_log_dir))
        
        # 模拟用户模糊指令
        result = intent_engine.understand_intent(
            conversation_id=session_id,
            cwd="/test/project",
            user_prompt="好的，按照我们刚才的讨论结果执行吧"
        )
        
        print(f"✓ 意图识别成功")
        print(f"  - 原始意图: {result.enhanced_intent.original_intent}")
        print(f"  - 增强意图: {result.enhanced_intent.enhanced_intent}")
        print(f"  - 意图类型: {result.enhanced_intent.intent_type}")
        print(f"  - 置信度: {result.enhanced_intent.confidence:.3f}")
        print(f"  - 处理时间: {result.processing_time:.3f}s")
        
        # 验证识别结果
        if "讨论" in result.enhanced_intent.enhanced_intent:
            print(f"✓ 成功识别基于讨论的意图")
        
        if result.enhanced_intent.confidence > 0.8:
            print(f"✓ 置信度较高，识别准确")
        
        return True
        
    except Exception as e:
        print(f"✗ 意图识别测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_enhanced_resolution():
    """测试增强解析"""
    print("\n" + "="*60)
    print("测试增强解析")
    print("="*60)
    
    try:
        # 创建测试技能目录
        test_skills_dir = Path(__file__).parent / "test_data" / "skills"
        test_skills_dir.mkdir(parents=True, exist_ok=True)
        
        # 创建测试技能
        skills = [
            {
                "name": "gemini-integration",
                "description": "Gemini MCP工具集成技能，用于在Claude Code中调用Gemini进行大上下文分析",
                "tech_stack": ["gemini", "mcp"],
                "language": ["python"],
                "capability": ["integration"]
            },
            {
                "name": "skill-documentation",
                "description": "创建和维护技能文档的技能",
                "tech_stack": ["documentation"],
                "language": ["markdown"],
                "capability": ["documentation"]
            }
        ]
        
        for i, skill in enumerate(skills, 1):
            skill_dir = test_skills_dir / f"skill-{i}"
            skill_dir.mkdir()
            
            skill_file = skill_dir / "SKILL.md"
            content = f"""---
name: {skill['name']}
description: "{skill['description']}"
tech_stack: {skill['tech_stack']}
language: {skill['language']}
capability: {skill['capability']}
---

# {skill['name']}

{skill['description']}
"""
            skill_file.write_text(content)
        
        # 创建增强解析器
        config = get_config()
        resolver = EnhancedSkillResolver(config=config)
        resolver.load_skill_catalog(str(test_skills_dir))
        
        # 测试增强解析
        result = resolver.resolve(
            user_prompt="集成Gemini MCP工具",
            cwd="/test/project",
            conversation_id=None,
            tech_stack=None,
            capability=None,
            language=None,
            top_n_limit=10
        )
        
        print(f"✓ 增强解析成功")
        print(f"  - 找到技能: {len(result.skills)}")
        print(f"  - 原始意图: {result.original_intent}")
        print(f"  - 增强意图: {result.enhanced_intent}")
        print(f"  - 总体置信度: {result.confidence:.3f}")
        print(f"  - 处理时间: {result.processing_time:.3f}s")
        print(f"  - 依赖分析: {len(result.dependency_analysis)} 项")
        
        # 显示找到的技能
        for i, skill in enumerate(result.skills[:3]):
            print(f"  - 技能{i+1}: {skill.get('name', '')} (评分: {skill.get('score', 0):.3f})")
        
        return True
        
    except Exception as e:
        print(f"✗ 增强解析测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_performance():
    """测试性能"""
    print("\n" + "="*60)
    print("测试性能")
    print("="*60)
    
    try:
        # 创建测试数据
        test_skills_dir = Path(__file__).parent / "test_data" / "performance_skills"
        test_skills_dir.mkdir(parents=True, exist_ok=True)
        
        # 创建大量测试技能
        num_skills = 50
        for i in range(1, num_skills + 1):
            skill_dir = test_skills_dir / f"skill-{i}"
            skill_dir.mkdir()
            
            skill_file = skill_dir / "SKILL.md"
            content = f"""---
name: test-skill-{i}
description: "测试技能 {i}，用于性能测试"
tech_stack: ["test"]
language: ["python"]
capability: ["test"]
---

# 测试技能 {i}

这是一个测试技能文件，用于性能测试。
"""
            skill_file.write_text(content)
        
        # 创建解析器
        config = get_config()
        resolver = EnhancedSkillResolver(config=config)
        
        # 加载技能目录
        start_time = time.time()
        resolver.load_skill_catalog(str(test_skills_dir))
        load_time = time.time() - start_time
        
        print(f"✓ 加载 {num_skills} 个技能: {load_time:.3f}s")
        
        # 测试多次检索性能
        num_queries = 10
        query_times = []
        
        for i in range(num_queries):
            start_time = time.time()
            result = resolver.resolve(
                user_prompt=f"测试查询 {i}",
                cwd="/test/project",
                conversation_id=None,
                tech_stack=None,
                capability=None,
                language=None,
                top_n_limit=10
            )
            query_time = time.time() - start_time
            query_times.append(query_time)
        
        avg_query_time = sum(query_times) / len(query_times)
        max_query_time = max(query_times)
        min_query_time = min(query_times)
        
        print(f"✓ {num_queries} 次查询性能:")
        print(f"  - 平均查询时间: {avg_query_time:.3f}s")
        print(f"  - 最大查询时间: {max_query_time:.3f}s")
        print(f"  - 最小查询时间: {min_query_time:.3f}s")
        
        # 获取统计信息
        stats = resolver.get_stats()
        print(f"✓ 性能统计:")
        print(f"  - 总请求数: {stats['total_requests']}")
        print(f"  - 缓存命中率: {stats['cache_hit_rate']:.2%}")
        print(f"  - 平均处理时间: {stats['average_processing_time']:.3f}s")
        
        # 性能目标验证
        if avg_query_time < 1.0:
            print(f"✓ 性能达标：平均查询时间 < 1.0s")
        else:
            print(f"⚠ 性能警告：平均查询时间 > 1.0s")
        
        return True
        
    except Exception as e:
        print(f"✗ 性能测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_monitoring():
    """测试监控功能"""
    print("\n" + "="*60)
    print("测试监控功能")
    print("="*60)
    
    try:
        # 获取监控器
        monitor = get_monitor()
        
        # 模拟一些监控事件
        for i in range(5):
            monitor.record_recognition(
                user_prompt=f"测试监控 {i}",
                session_id=f"session-{i}",
                result={"enhanced_intent": {"intent_type": "test"}},
                processing_time=0.1 + i * 0.01,
                confidence=0.8 + i * 0.02
            )
        
        # 获取性能指标
        metrics = monitor.get_metrics()
        
        print(f"✓ 监控数据收集成功")
        print(f"  - 总事件数: {metrics['total_requests']}")
        print(f"  - 成功请求数: {metrics['successful_requests']}")
        print(f"  - 平均处理时间: {metrics['average_processing_time']:.3f}s")
        print(f"  - 平均置信度: {metrics['average_confidence']:.3f}")
        
        # 生成监控报告
        report = monitor.generate_report()
        print(f"\n✓ 监控报告生成成功")
        print(f"{report[:500]}...")  # 显示报告前500个字符
        
        return True
        
    except Exception as e:
        print(f"✗ 监控测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """主函数"""
    print("╔" + "═"*58 + "╗")
    print("║" + " "*15 + "意图增强技能检索系统" + " "*18 + "║")
    print("║" + " "*20 + "集成测试" + " "*28 + "║")
    print("╚" + "═"*58 + "╝")
    
    # 运行测试
    results = []
    
    results.append(("基础功能", test_basic_functionality()))
    results.append(("意图识别", test_intent_recognition()))
    results.append(("增强解析", test_enhanced_resolution()))
    results.append(("性能测试", test_performance()))
    results.append(("监控功能", test_monitoring()))
    
    # 输出测试结果摘要
    print("\n" + "="*60)
    print("测试结果摘要")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"{test_name:20s} {status}")
    
    print("="*60)
    print(f"总计: {passed}/{total} 通过")
    print("="*60)
    
    # 返回退出码
    return 0 if passed == total else 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)