# 项目结构设计

## 方案一：完全独立（推荐）

```
intent-enhanced-skill-catalog/
├── src/
│   ├── intent_recognition/     # 意图识别系统
│   ├── retrieval/             # 检索引擎
│   ├── utils/                 # 工具模块
│   └── integration/          # 集成层
├── tests/                    # 测试代码
├── configs/                  # 配置文件
├── deployment/               # 部署脚本
└── examples/                 # 使用示例
```

## 方案二：混合集成（推荐）

```
claude-config/
├── mcp/skill-catalog/        # 原有MCP server（保持不变）
├── intent-enhancement/       # 新增意图增强模块
│   ├── src/
│   │   ├── intent_recognition/
│   │   ├── retrieval/
│   │   └── integration/
│   ├── tests/
│   └── deployment/
└── docs/plans/               # 技术文档
```

## 方案选择理由

### 选择方案一的理由：
1. **依赖隔离**：避免新依赖影响现有MCP server
2. **独立部署**：可以单独测试和部署
3. **清晰职责**：MCP server专注于工具调用，意图增强专注于上下文理解
4. **扩展性**：未来可以支持其他工具的意图识别

### 集成方式：
- 通过修改`skill-catalog`的`resolve`方法调用增强模块
- 保持MCP接口不变，内部调用增强逻辑
- 支持开关控制，可以降级到原有模式

## 实施步骤

### 第一步：创建独立项目
```bash
mkdir intent-enhanced-skill-catalog
cd intent-enhanced-skill-catalog
git init
```

### 第二步：实现核心功能
1. 实现意图识别系统
2. 实现混合检索引擎
3. 实现智能缓存

### 第三步：集成到MCP server
1. 修改`skill-catalog`的`resolve`方法
2. 添加增强功能调用
3. 保持向后兼容

### 第四步：测试和部署
1. 单元测试
2. 集成测试
3. 渐进式部署

## 代码示例

### 增强后的resolve方法
```python
# skill-catalog/src/skill_catalog/pipeline.py
def run_resolve_pipeline(
    catalog: SkillCatalog,
    classifier: Classifier,
    user_prompt: str,
    cwd: str | Path,
    tech_stack: list[str] | None = None,
    capability: list[str] | None = None,
    language: list[str] | None = None,
    top_n_limit: int | None = None,
) -> dict:
    
    # 检查是否启用意图增强
    # 注意：以下为集成示例，`IntentEnhancedResolver` 为后续将新增的 pipeline 适配层类，与已实现的 `EnhancedSkillResolver`（完整检索解析器）职责不同。
    if os.getenv("ENABLE_INTENT_ENHANCEMENT", "false").lower() == "true":
        from intent_enhancement import IntentEnhancedResolver
        enhanced_resolver = IntentEnhancedResolver()
        return enhanced_resolver.resolve(
            user_prompt=user_prompt,
            cwd=cwd,
            tech_stack=tech_stack,
            capability=capability,
            language=language,
            top_n_limit=top_n_limit
        )
    
    # 原有逻辑
    fp = scan_with_submodules(cwd_path)
    # ... 原有代码
```

### 意图增强解析器
```python
# intent-enhanced-skill-catalog/src/intent_enhancement.py
class IntentEnhancedResolver:
    def resolve(self, user_prompt, cwd, **kwargs):
        # 1. 解析对话日志
        intent_engine = IntentRecognitionEngine()
        enhanced_intent = intent_engine.understand_intent(
            conversation_id=kwargs.get("conversation_id"),
            cwd=cwd,
            user_prompt=user_prompt
        )
        
        # 2. 混合检索
        retrieval_engine = HybridRetrievalEngine()
        skills = retrieval_engine.search(
            query=enhanced_intent.enhanced_query,
            context=enhanced_intent.context,
            **kwargs
        )
        
        # 3. 返回增强结果
        return {
            "skills": skills,
            "enhanced_intent": enhanced_intent,
            "confidence": enhanced_intent.confidence
        }
```

这样既保持了系统的模块化，又能渐进式地引入新功能。