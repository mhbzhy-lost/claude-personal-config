# 基于Claude Code日志的完整意图识别系统

## 文档信息
- **创建时间**: 2026-04-23
- **版本**: v1.0
- **负责人**: 待分配
- **状态**: 待实施

## 1. 背景与目标

### 1.1 背景
当前技能检索系统面临的核心问题是**输入信息不足**：
- 仅能接收到单句user prompt和工作目录路径
- 无法理解多轮对话的历史上下文
- 无法识别文件引用和代码内容
- 难以处理"按讨论结果执行"等模糊指令

### 1.2 目标
基于Claude Code日志构建完整的意图识别系统：
- **多维度上下文**：对话历史、文件引用、技术决策、项目状态
- **智能意图补全**：将模糊指令转化为具体技术需求
- **文件内容理解**：深入分析引用文件的技术细节
- **技术决策追踪**：维护技术选型和约束条件的演进

## 2. Claude Code日志结构分析

### 2.1 日志文件位置与格式
- **位置**: `/Users/mhbzhy/.claude/projects/<session-id>.jsonl`
- **格式**: JSON Lines，每行一个事件对象
- **会话标识**: `sessionId` 字段关联同一会话的所有事件

### 2.2 关键事件类型

#### 用户消息事件
```json
{
  "type": "user",
  "role": "user", 
  "message": {
    "role": "user",
    "content": [
      {"type": "text", "text": "我现在需要你调研并实现：将gemini的cli工具封装的mcp tool..."}
    ]
  },
  "timestamp": "2026-04-13T03:10:19.564Z",
  "uuid": "c7dc4879-f81e-428e-bc5d-ce8dfc9b6338",
  "sessionId": "871fc40c-aa9a-47c2-a895-de9a2cd64b74",
  "cwd": "/Users/mhbzhy/.claude"
}
```

#### 助手响应事件
```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [
      {"type": "text", "text": "[claude-opus-4-6] 调研完成，以下是我的集成方案..."},
      {"type": "tool_use", "name": "Agent", "input": {...}}
    ]
  },
  "timestamp": "2026-04-13T03:20:33.832Z",
  "uuid": "6040fdf8-02fe-4548-b069-1703a0294400",
  "sessionId": "871fc40c-aa9a-47c2-a895-de9a2cd64b74"
}
```

#### 文件引用事件
```json
{
  "type": "attachment",
  "attachment": {
    "type": "file",
    "filename": "/Users/mhbzhy/.claude/CLAUDE.md",
    "content": {
      "type": "text",
      "file": {
        "filePath": "/Users/mhbzhy/.claude/CLAUDE.md",
        "content": "# 输出格式：模型标签\n..."
      }
    }
  },
  "timestamp": "2026-04-13T03:10:19.563Z"
}
```

#### 工具调用事件
```json
{
  "type": "attachment",
  "attachment": {
    "type": "deferred_tools_delta",
    "addedNames": ["AskUserQuestion", "CronCreate", ...],
    "addedLines": ["AskUserQuestion", "CronCreate", ...]
  },
  "timestamp": "2026-04-13T03:10:19.563Z"
}
```

### 2.3 关键数据结构

#### 会话数据模型
```python
@dataclass
class ConversationSession:
    session_id: str
    messages: List[ConversationMessage]
    tool_calls: List[ToolCall]
    file_references: List[FileReference]
    technical_decisions: List[TechnicalDecision]
    project_state: ProjectState
    
@dataclass
class ConversationMessage:
    role: str  # "user", "assistant", "system"
    content: List[ContentItem]
    timestamp: str
    uuid: str
    parent_uuid: Optional[str]
    
@dataclass
class FileReference:
    file_path: str
    content: Optional[str]
    timestamp: str
    file_type: str
    purpose: str  # "mentioned", "read", "edited", "created"
```

## 3. 系统架构设计

### 3.1 整体架构
```
Claude Code日志 → 数据解析 → 意图理解 → 技能检索 → 增强推荐
    ↓            ↓         ↓         ↓         ↓
  会话识别 → 上下文构建 → 意图补全 → 依赖检测 → 结果优化
```

### 3.2 核心组件

#### 3.2.1 数据收集层 (DataCollector)
```python
class ClaudeCodeLogParser:
    """Claude Code日志解析器"""
    
    def __init__(self, log_directory: str):
        self.log_dir = Path(log_directory)
        self.current_session = None
        
    def parse_conversation(self, session_id: str) -> ConversationSession:
        """解析指定会话的完整对话"""
        log_file = self.log_dir / f"{session_id}.jsonl"
        
        session = ConversationSession(
            session_id=session_id,
            messages=[],
            tool_calls=[],
            file_references=[],
            technical_decisions=[],
            project_state=ProjectState()
        )
        
        with open(log_file, 'r', encoding='utf-8') as f:
            for line in f:
                event = json.loads(line.strip())
                self._process_event(session, event)
                
        return session
    
    def _process_event(self, session: ConversationSession, event: dict):
        """处理单个事件"""
        event_type = event.get("type")
        
        if event_type == "user":
            message = self._parse_user_message(event)
            session.messages.append(message)
            
        elif event_type == "assistant":
            message = self._parse_assistant_message(event)
            session.messages.append(message)
            
        elif event_type == "attachment":
            attachment = event.get("attachment", {})
            if attachment.get("type") == "file":
                file_ref = self._parse_file_reference(attachment)
                session.file_references.append(file_ref)
    
    def _parse_file_reference(self, attachment: dict) -> FileReference:
        """解析文件引用"""
        return FileReference(
            file_path=attachment.get("filename"),
            content=self._extract_file_content(attachment),
            timestamp=attachment.get("timestamp"),
            file_type=self._identify_file_type(attachment.get("filename")),
            purpose=self._infer_file_purpose(attachment)
        )
```

#### 3.2.2 意图理解引擎 (IntentUnderstandingEngine)
```python
class IntentUnderstandingEngine:
    """意图理解引擎"""
    
    def __init__(self):
        self.file_analyzer = FileReferenceAnalyzer()
        self.context_tracker = ContextTracker()
        self.decision_extractor = DecisionExtractor()
        self.intent_completer = IntentCompleter()
        
    def understand_intent(self, 
                         conversation: ConversationSession, 
                         cwd: str) -> EnhancedIntent:
        """理解用户意图"""
        
        # 1. 文件引用分析
        file_context = self.file_analyzer.analyze_files(conversation.file_references)
        
        # 2. 对话历史分析
        dialogue_context = self._analyze_dialogue_history(conversation.messages)
        
        # 3. 技术决策提取
        technical_decisions = self.decision_extractor.extract(conversation)
        
        # 4. 上下文状态追踪
        project_state = self.context_tracker.update_state(
            conversation, file_context, technical_decisions
        )
        
        # 5. 意图补全和识别
        latest_message = conversation.messages[-1] if conversation.messages else None
        enhanced_intent = self.intent_completer.complete_intent(
            latest_message,
            {
                "file_context": file_context,
                "dialogue_context": dialogue_context, 
                "technical_decisions": technical_decisions,
                "project_state": project_state,
                "current_cwd": cwd
            }
        )
        
        return enhanced_intent
```

#### 3.2.3 文件引用分析器 (FileReferenceAnalyzer)
```python
class FileReferenceAnalyzer:
    """文件引用分析器"""
    
    def analyze_files(self, file_references: List[FileReference]) -> FileContext:
        """分析文件引用"""
        analysis = FileContext(
            mentioned_files=[],
            project_structure={},
            technical_stack=set(),
            code_patterns=[],
            requirements=[]
        )
        
        for ref in file_references:
            # 文件类型识别
            file_type = self._identify_file_type(ref.file_path, ref.content)
            
            # 技术栈检测
            tech_stack = self._detect_tech_stack(ref.content)
            analysis.technical_stack.update(tech_stack)
            
            # 项目结构分析
            structure = self._analyze_project_structure(ref.file_path, ref.content)
            analysis.project_structure.update(structure)
            
            # 代码模式提取
            patterns = self._extract_code_patterns(ref.content)
            analysis.code_patterns.extend(patterns)
            
            # 需求分析
            requirements = self._extract_requirements(ref.content)
            analysis.requirements.extend(requirements)
            
            analysis.mentioned_files.append({
                "path": ref.file_path,
                "type": file_type,
                "purpose": ref.purpose,
                "key_points": self._extract_key_points(ref.content)
            })
        
        return analysis
    
    def _identify_file_type(self, file_path: str, content: str) -> str:
        """识别文件类型"""
        ext = Path(file_path).suffix.lower()
        
        type_mapping = {
            '.md': 'markdown',
            '.json': 'json',
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript-react',
            '.jsx': 'javascript-react',
            '.yml': 'yaml',
            '.yaml': 'yaml',
            '.toml': 'toml',
            '.ini': 'ini'
        }
        
        return type_mapping.get(ext, 'unknown')
    
    def _detect_tech_stack(self, content: str) -> Set[str]:
        """检测技术栈"""
        tech_keywords = {
            'react', 'vue', 'angular', 'django', 'flask', 'fastapi',
            'postgresql', 'mysql', 'mongodb', 'redis', 'kafka',
            'docker', 'kubernetes', 'aws', 'gcp', 'azure',
            'node.js', 'python', 'typescript', 'javascript',
            'graphql', 'rest', 'grpc'
        }
        
        found_tech = set()
        content_lower = content.lower()
        
        for tech in tech_keywords:
            if tech in content_lower:
                found_tech.add(tech)
        
        return found_tech
```

#### 3.2.4 上下文追踪器 (ContextTracker)
```python
class ContextTracker:
    """上下文状态追踪器"""
    
    def __init__(self):
        self.state_history = []
        self.current_state = ProjectState()
        
    def update_state(self, 
                    conversation: ConversationSession,
                    file_context: FileContext,
                    technical_decisions: List[TechnicalDecision]) -> ProjectState:
        """更新项目状态"""
        
        # 1. 更新技术栈
        self.current_state.technical_stack = file_context.technical_stack
        
        # 2. 更新项目结构
        self.current_state.project_structure = file_context.project_structure
        
        # 3. 更新约束条件
        constraints = self._extract_constraints(conversation, technical_decisions)
        self.current_state.constraints = constraints
        
        # 4. 更新决策路径
        decisions = self._build_decision_path(conversation, technical_decisions)
        self.current_state.decision_path = decisions
        
        # 5. 记录状态历史
        self.state_history.append(copy.deepcopy(self.current_state))
        
        return self.current_state
    
    def _extract_constraints(self, 
                            conversation: ConversationSession,
                            decisions: List[TechnicalDecision]) -> List[str]:
        """提取约束条件"""
        constraints = []
        
        # 从对话中提取约束
        for msg in conversation.messages:
            if msg.role == "user":
                constraints.extend(self._parse_constraints(msg.content))
        
        # 从决策中提取约束
        for decision in decisions:
            if decision.constraints:
                constraints.extend(decision.constraints)
        
        return list(set(constraints))
```

#### 3.2.5 意图补全器 (IntentCompleter)
```python
class IntentCompleter:
    """意图补全器"""
    
    def __init__(self):
        self.patterns = {
            "好的，按照我们刚才的讨论结果执行吧": self._complete_discussion_intent,
            "按计划执行": self._complete_plan_intent,
            "我们之前讨论的": self._complete_reference_intent,
            "你之前提到的": self._complete_reference_intent
        }
    
    def complete_intent(self, 
                       latest_message: Optional[ConversationMessage],
                       context: dict) -> EnhancedIntent:
        """补全用户意图"""
        
        if not latest_message:
            return EnhancedIntent(
                original_intent="",
                enhanced_intent="",
                intent_type="empty",
                confidence=0.0,
                context=context
            )
        
        # 获取用户输入的文本
        user_text = self._extract_text_from_content(latest_message.content)
        
        # 模式匹配
        for pattern, handler in self.patterns.items():
            if pattern in user_text:
                enhanced_intent = handler(user_text, context)
                enhanced_intent.confidence = 0.9
                return enhanced_intent
        
        # 默认意图处理
        enhanced_intent = self._default_intent_handler(user_text, context)
        enhanced_intent.confidence = self._calculate_confidence(user_text, context)
        
        return enhanced_intent
    
    def _complete_discussion_intent(self, user_text: str, context: dict) -> EnhancedIntent:
        """补全基于讨论的意图"""
        
        # 从对话历史中提取关键讨论点
        discussion_points = context["dialogue_context"]["discussion_points"]
        
        # 从技术决策中提取要点
        decisions = context["technical_decisions"]
        
        enhanced_intent = {
            "original_intent": user_text,
            "enhanced_intent": f"基于之前的讨论，执行以下任务：{discussion_points[-1] if discussion_points else ''}",
            "intent_type": "discussion_based",
            "key_points": discussion_points,
            "technical_constraints": context["project_state"].constraints,
            "preferred_technologies": list(context["project_state"].technical_stack),
            "file_context": context["file_context"]
        }
        
        return EnhancedIntent(**enhanced_intent)
    
    def _complete_plan_intent(self, user_text: str, context: dict) -> EnhancedIntent:
        """补全基于计划的意图"""
        
        # 查找最近的计划文件
        plan_files = self._find_plan_files(context["file_context"])
        
        enhanced_intent = {
            "original_intent": user_text,
            "enhanced_intent": f"执行技术计划：从{plan_files[-1] if plan_files else '项目文档'}中提取的任务",
            "intent_type": "plan_based",
            "plan_files": plan_files,
            "project_context": context["project_state"]
        }
        
        return EnhancedIntent(**enhanced_intent)
```

### 3.3 数据流设计

#### 3.3.1 完整数据流
```
输入参数: {
  "user_prompt": "好的，按照我们刚才的讨论结果执行吧",
  "cwd": "/project/path",
  "conversation_id": "session-id"
}

↓

数据收集:
  - 解析日志文件 → ConversationSession
  - 提取文件引用 → FileContext
  - 追踪技术决策 → TechnicalDecision

↓

意图理解:
  - 对话历史分析 → DialogueContext
  - 意图模式匹配 → IntentType
  - 上下文补全 → EnhancedIntent

↓

技能检索:
  - 增强查询生成 → EnhancedQuery
  - 技能依赖检测 → SkillDependencies
  - 结果排序优化 → RankedSkills

↓

输出结果:
  {
    "skills": [...],
    "enhanced_intent": "...",
    "used_context": {...},
    "confidence": 0.9
  }
```

#### 3.3.2 意图补全示例

**场景1：基于讨论的执行**
```
用户输入: "好的，按照我们刚才的讨论结果执行吧"

上下文:
  - 对话历史: 讨论 "集成Gemini MCP工具"
  - 技术决策: 使用 jamubc/gemini-mcp-tool
  - 文件引用: CLAUDE.md, 技能文档

增强意图: "在Claude Code项目中集成Gemini MCP工具，配置mcp server并创建使用skill"
```

**场景2：文件引用执行**
```
用户输入: "按照这个文件描述的计划执行"

上下文:
  - 文件引用: /Users/mhbzhy/docs/plan.md (内容包含技术实现计划)
  - 项目状态: 当前目录为Gemini集成项目
  - 技术栈: 已确定使用gemini-mcp-tool

增强意图: "执行Gemini MCP工具集成计划：配置mcp server、创建skill文档、更新CLAUDE.md规则"
```

## 4. 实施计划

### 4.1 开发阶段（4周）

#### 第1周：数据解析层
- **任务1**：Claude Code日志解析器开发
- **任务2**：文件引用分析器实现
- **任务3**：会话数据模型定义
- **验收标准**：能够正确解析日志文件，提取完整会话信息

#### 第2周：意图理解层
- **任务1**：对话历史分析器开发
- **任务2**：技术决策提取器实现
- **任务3**：上下文状态追踪器开发
- **验收标准**：能够从对话中提取技术决策和约束条件

#### 第3周：意图补全层
- **任务1**：意图模式匹配器开发
- **任务2**：意图补全算法实现
- **任务3**：上下文增强引擎开发
- **验收标准**：能够将模糊指令补全为具体技术需求

#### 第4周：集成测试
- **任务1**：端到端功能测试
- **任务2**：性能优化和缓存
- **任务3**：错误处理和降级策略
- **验收标准**：系统稳定运行，意图识别准确率>90%

### 4.2 测试阶段（1周）

#### 单元测试
- 每个组件的单元测试覆盖率>90%
- 边界条件测试（空日志、格式错误日志）
- 性能基准测试（大数据量处理）

#### 集成测试
- 端到端意图识别测试
- 多轮对话场景测试
- 文件引用场景测试

#### 真实数据测试
- 使用历史日志进行回测
- 人工标注的意图验证
- 准确率和召回率评估

### 4.3 部署阶段（1周）

#### 灰度发布
- 10%流量切换到新系统
- 监控关键指标
- 用户反馈收集

#### 全量部署
- 100%流量切换
- 回滚方案准备
- 监控告警配置

## 5. 关键功能特性

### 5.1 多维度上下文理解
- **对话历史**：完整理解用户的技术讨论过程
- **文件引用**：深入分析提到的文件内容和意图
- **技术决策**：追踪技术选型和约束条件
- **项目状态**：维护当前项目的完整技术状态

### 5.2 智能意图补全
- **模式识别**：识别常见的模糊指令模式
- **上下文关联**：基于历史对话补全具体需求
- **技术推理**：从文件内容推断用户真实意图
- **约束应用**：将项目约束条件应用到意图理解

### 5.3 动态上下文更新
- **实时状态追踪**：随着对话进行更新项目状态
- **决策路径记录**：维护技术决策的演进过程
- **约束条件传播**：约束条件影响后续决策
- **技术栈演进**：记录技术栈的变化过程

### 5.4 错误处理与降级
- **日志解析失败**：降级到基础模式匹配
- **上下文缺失**：使用当前目录和技能检索
- **意图识别失败**：提供推荐技能列表
- **性能问题**：启用缓存和批处理

## 6. 性能指标与监控

### 6.1 核心指标
| 指标名称 | 目标值 | 监控频率 |
|---------|--------|----------|
| 意图识别准确率 | >90% | 实时 |
| 上下文解析成功率 | >95% | 实时 |
| 端到端响应时间 | <1s | 实时 |
| 内存使用量 | <512MB | 每小时 |
| 日志解析成功率 | >99% | 每日 |

### 6.2 业务指标
| 指标名称 | 目标值 | 监控频率 |
|---------|--------|----------|
| 用户满意度提升 | >40% | 每周 |
| 技能匹配准确率 | >85% | 每日 |
| 重复查询减少 | >60% | 每周 |
| 文件引用识别率 | >90% | 每日 |

### 6.3 监控实现
```python
class IntentRecognitionMonitor:
    """意图识别监控"""
    
    def __init__(self):
        self.metrics = {
            "intent_accuracy": [],
            "context_success_rate": [],
            "response_time": [],
            "error_rate": []
        }
    
    def record_attempt(self, original_intent: str, enhanced_intent: str, success: bool):
        """记录意图识别尝试"""
        # 计算准确率
        accuracy = self._calculate_accuracy(original_intent, enhanced_intent)
        self.metrics["intent_accuracy"].append(accuracy)
        
        # 记录成功率
        self.metrics["context_success_rate"].append(success)
        
    def get_metrics(self) -> dict:
        """获取当前指标"""
        return {
            "avg_accuracy": sum(self.metrics["intent_accuracy"]) / len(self.metrics["intent_accuracy"]),
            "success_rate": sum(self.metrics["context_success_rate"]) / len(self.metrics["context_success_rate"])
        }
```

## 7. 风险评估

### 7.1 技术风险

#### 风险1：日志格式变化
- **可能性**：低
- **影响**：解析失败
- **缓解措施**：
  - 实现格式适配层
  - 支持多版本日志格式
  - 自动检测日志格式版本

#### 风险2：大文件处理性能
- **可能性**：中等
- **影响**：响应延迟
- **缓解措施**：
  - 实现增量解析
  - 文件内容缓存
  - 流式处理大文件

#### 风险3：意图歧义
- **可能性**：中等
- **影响**：推荐不准确
- **缓解措施**：
  - 多重意图验证
  - 用户反馈机制
  - 人工审核机制

### 7.2 业务风险

#### 风险1：用户体验变化
- **可能性**：低
- **影响**：适应期
- **缓解措施**：
  - 渐进式功能上线
  - 用户引导说明
  - 回滚方案准备

#### 风险2：数据隐私
- **可能性**：低
- **影响**：隐私泄露
- **缓解措施**：
  - 数据脱敏处理
  - 访问权限控制
  - 安全审计机制

## 8. 后续优化

### 8.1 短期优化（1-2个月）
- **性能优化**：缓存机制、批处理、异步处理
- **准确性提升**：更多模式识别、机器学习优化
- **用户体验**：实时反馈、进度显示、错误提示

### 8.2 中期优化（3-6个月）
- **个性化**：基于用户使用习惯的个性化意图理解
- **多模态**：支持图片、图表等多媒体内容理解
- **协作功能**：多用户协作场景的意图理解

### 8.3 长期优化（6个月以上）
- **自适应学习**：从用户反馈中持续学习优化
- **预测性理解**：预测用户下一步需求
- **跨会话理解**：支持跨多个会话的长期项目理解

## 9. 成功标准

### 9.1 技术成功标准
- ✅ 意图识别准确率 >90%
- ✅ 上下文解析成功率 >95%
- ✅ 端到端响应时间 <1s
- ✅ 系统可用性 >99.9%
- ✅ 内存使用量 <512MB

### 9.2 业务成功标准
- ✅ 用户满意度提升40%
- ✅ 技能匹配准确率提升50%
- ✅ 重复查询减少60%
- ✅ 文件引用识别率>90%
- ✅ 技术决策提取准确率>85%

### 9.3 长期成功标准
- ✅ 成为团队标准工具
- ✅ 支持复杂的长时间项目
- ✅ 用户主动使用高级功能
- ✅ 为后续AI功能奠定基础

---

**文档版本控制**:
- v1.0 (2026-04-23) - 初始版本

**审批记录**:
- [ ] 产品经理审批
- [ ] 技术负责人审批
- [ ] 运维负责人审批
- [ ] 最终负责人审批