# 意图增强技能检索系统

基于Claude Code日志和混合检索引擎的智能技能推荐系统

## 📋 项目概述

本项目旨在解决现有技能检索系统的核心问题：
- **输入信息不足**：仅能接收单句user prompt，无法理解多轮对话上下文
- **检索精度有限**：依赖简单的关键词匹配，无法处理复杂技术需求
- **意图理解缺失**：无法处理"按讨论结果执行"等模糊指令

通过以下创新实现智能增强：
- 🧠 **多维度意图识别**：基于Claude Code日志理解真实技术需求
- 🔍 **混合检索引擎**：结合关键词、规则、向量和LLM的多层检索策略
- 🤝 **技能依赖分析**：智能检测技能依赖关系和冲突
- ⚡ **智能缓存系统**：大幅提升响应速度

## 🏗️ 项目结构

```
intent-enhancement/
├── src/                          # 源代码
│   ├── intent_recognition/        # 意图识别模块
│   │   ├── parser.py             # Claude Code日志解析器
│   │   ├── analyzer.py           # 文件引用分析器
│   │   ├── completer.py          # 意图补全器
│   │   └── engine.py             # 意图识别引擎
│   ├── retrieval/                # 检索引擎模块
│   │   ├── hybrid_engine.py      # 混合检索引擎
│   │   ├── cache.py              # 智能缓存
│   │   ├── vector_store.py       # 向量存储
│   │   ├── ranker.py             # 技能排序器
│   │   └── dependency.py         # 技能依赖图
│   ├── integration/              # 集成层模块
│   │   ├── enhanced_resolver.py  # 增强技能解析器
│   │   └── monitor.py            # 监控系统
│   └── utils/                    # 工具模块
│       ├── config.py             # 配置管理
│       └── __init__.py
├── tests/                        # 测试代码
│   └── test_system.py           # 系统测试
├── config/                       # 配置文件
│   └── config.json              # 主配置文件
├── logs/                         # 日志目录
├── run_tests.py                 # 集成测试脚本
├── requirements.txt             # Python依赖
└── README.md                    # 项目文档
```

## 🚀 快速开始

### 环境要求

- Python 3.8+
- Claude Code（用于日志分析）
- 足够的磁盘空间用于缓存和日志

### 安装步骤

1. **克隆项目**
```bash
cd /Users/mhbzhy/claude-config/intent-enhancement
```

2. **安装依赖**
```bash
pip install -r requirements.txt
```

3. **配置系统**
```bash
# 编辑配置文件
cp config/config.json config/config.json.local
vim config/config.json.local
```

4. **运行测试**
```bash
python run_tests.py
```

## 💡 使用方法

### 基础用法

```python
from integration import EnhancedSkillResolver
from utils.config import get_config

# 创建解析器
config = get_config()
resolver = EnhancedSkillResolver(config=config)

# 加载技能目录
resolver.load_skill_catalog("/path/to/skills")

# 解析用户意图
result = resolver.resolve(
    user_prompt="集成Gemini MCP工具",
    cwd="/project/path",
    conversation_id="session-id",  # 可选
    top_n_limit=10
)

# 访问结果
print(f"增强意图: {result.enhanced_intent}")
print(f"找到技能: {len(result.skills)}")
print(f"置信度: {result.confidence}")

for skill in result.skills:
    print(f"- {skill['name']}: {skill['score']:.3f}")
```

### 高级用法

```python
# 意图识别
from intent_recognition import IntentRecognitionEngine

intent_engine = IntentRecognitionEngine()
recognition_result = intent_engine.understand_intent(
    conversation_id="session-id",
    cwd="/project/path",
    user_prompt="按讨论结果执行"
)

print(f"意图类型: {recognition_result.enhanced_intent.intent_type}")
print(f"技术栈: {list(recognition_result.technical_info.frameworks)}")
```

```python
# 混合检索
from retrieval import HybridRetrievalEngine

retrieval_engine = HybridRetrievalEngine(skill_catalog_data)
search_result = retrieval_engine.search(
    query="django项目",
    tech_stack=["django"],
    top_n=10
)

print(f"找到技能: {len(search_result.skills)}")
print(f"使用缓存: {search_result.used_cache}")
```

```python
# 依赖分析
from retrieval import SkillDependencyGraph

dep_graph = SkillDependencyGraph()
analysis = dep_graph.analyze_dependencies(['django-drf', 'react-core'])

print(f"有冲突: {analysis.has_conflicts}")
print(f"缺失依赖: {analysis.missing_dependencies}")
print(f"推荐技能: {analysis.recommended_skills}")
```

## 🎯 核心功能

### 1. 意图识别系统

- **Claude Code日志解析**：解析JSON Lines格式的对话日志
- **文件引用分析**：提取文件内容、技术栈、依赖关系
- **对话上下文理解**：分析多轮对话中的技术讨论
- **意图补全**：将模糊指令补全为具体技术需求

### 2. 混合检索引擎

- **关键词预过滤**：快速筛选候选技能
- **规则匹配**：基于技术模式的智能匹配
- **向量检索**：语义相似度搜索
- **智能排序**：综合多维度因素排序

### 3. 技能依赖分析

- **依赖关系检测**：自动识别技能依赖
- **冲突检测**：发现不兼容的技能组合
- **智能推荐**：基于上下文推荐相关技能
- **拓扑排序**：确定技能加载顺序

### 4. 智能缓存系统

- **多级缓存**：会话缓存、结果缓存、向量缓存
- **自动过期**：基于时间的缓存管理
- **性能监控**：缓存命中率统计
- **智能清理**：LRU淘汰策略

## 📊 性能指标

### 目标指标

| 指标 | 目标值 | 当前值 |
|------|--------|--------|
| 意图识别准确率 | >90% | 待测试 |
| 技能检索响应时间 | <200ms | 待测试 |
| 缓存命中率 | >80% | 待测试 |
| 系统可用性 | >99.9% | 待测试 |

### 预期收益

- **性能提升**：响应时间从2-3秒降至200ms内（提升90%）
- **精度提升**：意图识别准确率提升40%
- **用户体验**：用户满意度提升50%
- **系统智能**：技能推荐准确率提升50%

## 🔧 配置说明

### 主要配置项

```json
{
  "cache": {
    "enabled": true,              // 是否启用缓存
    "ttl": 3600,                  // 缓存过期时间（秒）
    "max_size": 1000,             // 最大缓存条目数
    "strategy": "memory"          // 缓存策略
  },
  "intent": {
    "cache_enabled": true,        // 意图识别缓存
    "min_confidence": 0.5,        // 最小置信度
    "enable_pattern_matching": true,  // 启用模式匹配
    "enable_context_enhancement": true  // 启用上下文增强
  },
  "retrieval": {
    "cache_enabled": true,        // 检索缓存
    "top_n": 10,                  // 默认返回结果数量
    "enable_keyword_filter": true,  // 关键词过滤
    "enable_rule_matching": true,    // 规则匹配
    "enable_vector_search": true,    // 向量搜索
    "enable_dependency_analysis": true // 依赖分析
  },
  "claude_code": {
    "log_directory": null,        // Claude Code日志目录
    "auto_detect": true,          // 自动检测日志目录
    "max_session_age": 86400      // 最大会话年龄（秒）
  }
}
```

## 🧪 测试

### 运行测试

```bash
# 运行所有测试
python run_tests.py

# 运行单元测试
python -m pytest tests/test_system.py -v

# 运行性能测试
python run_tests.py --performance
```

### 测试覆盖

- ✅ Claude Code日志解析
- ✅ 文件引用分析
- ✅ 意图补全器
- ✅ 混合检索引擎
- ✅ 技能依赖图
- ✅ 增强技能解析器
- ✅ 配置管理
- ✅ 监控系统

## 📈 监控和日志

### 监控指标

- **请求统计**：总请求数、成功率、失败率
- **性能指标**：平均响应时间、P95/P99响应时间
- **缓存统计**：命中率、缓存大小
- **意图识别**：准确率、置信度分布

### 日志文件

- **系统日志**：`logs/system.log`
- **监控日志**：`logs/monitor.log`
- **错误日志**：`logs/error.log`

## 🚧 开发计划

### 已完成 ✅

- [x] Claude Code日志解析器
- [x] 文件引用分析器
- [x] 意图补全器
- [x] 混合检索引擎
- [x] 智能缓存系统
- [x] 技能依赖图
- [x] 增强技能解析器
- [x] 监控系统
- [x] 配置管理
- [x] 基础测试用例

### 待实现 🚧

- [ ] 向量存储优化（集成真实嵌入模型）
- [ ] 规则引擎扩展（更多技术模式）
- [ ] 机器学习优化（基于用户反馈）
- [ ] Web监控界面
- [ ] 性能优化和压力测试

## 🤝 贡献指南

欢迎提交Issue和Pull Request！

### 贡献流程

1. Fork本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

## 📄 许可证

本项目采用MIT许可证

## 📞 联系方式

- 项目维护者：Intent Enhancement Team
- 问题反馈：GitHub Issues
- 技术讨论：GitHub Discussions

---

**注意**：本项目是Claude Code技能检索系统的增强模块，需要与主系统配合使用。