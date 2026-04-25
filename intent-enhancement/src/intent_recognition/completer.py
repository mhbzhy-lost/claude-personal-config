"""
意图补全器

将模糊的用户输入补全为具体的技术需求，基于上下文和模式匹配
"""

import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

@dataclass
class DialogueContext:
    """对话上下文"""
    discussion_points: List[str] = None
    technical_constraints: List[str] = None
    preferences: List[str] = None
    decisions_made: List[str] = None
    
    def __post_init__(self):
        if self.discussion_points is None:
            self.discussion_points = []
        if self.technical_constraints is None:
            self.technical_constraints = []
        if self.preferences is None:
            self.preferences = []
        if self.decisions_made is None:
            self.decisions_made = []

@dataclass
class ProjectState:
    """项目状态"""
    technical_stack: set = None
    project_structure: dict = None
    constraints: List[str] = None
    decision_path: List[str] = None
    
    def __post_init__(self):
        if self.technical_stack is None:
            self.technical_stack = set()
        if self.project_structure is None:
            self.project_structure = {}
        if self.constraints is None:
            self.constraints = []
        if self.decision_path is None:
            self.decision_path = []

@dataclass
class EnhancedIntent:
    """增强的意图"""
    original_intent: str
    enhanced_intent: str
    intent_type: str
    confidence: float
    context: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.context is None:
            self.context = {}

class IntentCompleter:
    """意图补全器"""
    
    def __init__(self):
        # 意图模式定义
        self.patterns = {
            "DISCUSSION_BASED": {
                "patterns": [
                    r"好的，按照我们刚才的讨论结果执行吧",
                    r"按讨论执行",
                    r"基于之前的讨论",
                    r"按照我们讨论的",
                    r"按方案执行"
                ],
                "handler": self._complete_discussion_intent,
                "confidence": 0.9
            },
            "PLAN_BASED": {
                "patterns": [
                    r"按照这个计划.*执行",
                    r"执行计划",
                    r"按照文档执行",
                    r"按方案实施",
                    r"实施计划"
                ],
                "handler": self._complete_plan_intent,
                "confidence": 0.9
            },
            "REFERENCE_BASED": {
                "patterns": [
                    r"你之前提到的",
                    r"根据刚才的内容",
                    r"按照文件说的",
                    r"依据文档",
                    r"参考之前的"
                ],
                "handler": self._complete_reference_intent,
                "confidence": 0.8
            },
            "IMPLEMENTATION_BASED": {
                "patterns": [
                    r"开始实现",
                    r"开始编码",
                    r"着手开发",
                    r"进行实现",
                    r"动手实现"
                ],
                "handler": self._complete_implementation_intent,
                "confidence": 0.85
            }
        }
        
        # 模糊查询映射
        self.query_mappings = {
            "做项目": "项目开发",
            "开发系统": "系统开发",
            "写代码": "代码开发",
            "实现功能": "功能实现",
            "解决问题": "问题解决",
            "优化性能": "性能优化",
            "修复bug": "bug修复",
            "添加功能": "功能添加",
            "重构代码": "代码重构",
            "测试系统": "系统测试"
        }
        
        # 技术决策模板
        self.decision_templates = {
            "技术栈选择": "使用{tech_stack}作为主要技术栈",
            "架构设计": "采用{architecture}架构模式",
            "开发模式": "采用{pattern}开发模式",
            "部署方式": "使用{deployment}部署方式"
        }
    
    def complete_intent(self, 
                       user_text: str,
                       dialogue_context: DialogueContext,
                       project_state: ProjectState,
                       file_context: Dict[str, Any] = None) -> EnhancedIntent:
        """
        补全用户意图
        
        Args:
            user_text: 用户输入的文本
            dialogue_context: 对话上下文
            project_state: 项目状态
            file_context: 文件上下文
            
        Returns:
            EnhancedIntent: 补全后的意图
        """
        
        if not user_text or not user_text.strip():
            return EnhancedIntent(
                original_intent=user_text,
                enhanced_intent="请提供具体的技术需求描述",
                intent_type="empty",
                confidence=0.0,
                context={
                    "dialogue_context": dialogue_context,
                    "project_state": project_state,
                    "file_context": file_context or {}
                }
            )
        
        # 1. 模式匹配
        for intent_type, pattern_info in self.patterns.items():
            for pattern in pattern_info["patterns"]:
                if re.search(pattern, user_text, re.IGNORECASE):
                    enhanced_intent = pattern_info["handler"](
                        user_text, dialogue_context, project_state, file_context
                    )
                    enhanced_intent.confidence = pattern_info["confidence"]
                    enhanced_intent.intent_type = intent_type.lower()
                    return enhanced_intent
        
        # 2. 默认处理
        enhanced_intent = self._default_handler(
            user_text, dialogue_context, project_state, file_context
        )
        enhanced_intent.confidence = self._calculate_confidence(
            user_text, dialogue_context, project_state
        )
        
        return enhanced_intent
    
    def _complete_discussion_intent(self, user_text: str, dialogue_context: DialogueContext, 
                                  project_state: ProjectState, file_context: Dict[str, Any]) -> EnhancedIntent:
        """补全基于讨论的意图"""
        
        # 获取最新的讨论点
        latest_discussion = dialogue_context.discussion_points[-1] if dialogue_context.discussion_points else ""
        
        # 获取技术约束
        constraints = dialogue_context.technical_constraints
        
        # 生成增强意图
        enhanced_intent = f"基于技术讨论，实现需求：{latest_discussion}"
        
        if constraints:
            enhanced_intent += f"，约束条件：{', '.join(constraints[:3])}"
        
        tech_stack = list(project_state.technical_stack) if project_state else []
        return EnhancedIntent(
            original_intent=user_text,
            enhanced_intent=enhanced_intent,
            intent_type="discussion_based",
            confidence=0.9,
            context={
                "latest_discussion": latest_discussion,
                "constraints": constraints,
                "technical_stack": tech_stack,
            }
        )
    
    def _complete_plan_intent(self, user_text: str, dialogue_context: DialogueContext,
                            project_state: ProjectState, file_context: Dict[str, Any]) -> EnhancedIntent:
        """补全基于计划的意图"""
        
        # 从文件上下文中提取计划文件
        plan_files = []
        if file_context:
            for mentioned_file in file_context.get("mentioned_files", []):
                if "plan" in mentioned_file.get("path", "").lower():
                    plan_files.append(mentioned_file["path"])
        
        # 基于项目状态生成执行计划
        tech_stack = project_state.technical_stack
        
        enhanced_intent = f"执行技术实现计划，使用技术栈：{', '.join(list(tech_stack)[:3])}"
        
        if plan_files:
            enhanced_intent += f"，基于计划文件：{plan_files[-1]}"
        
        return EnhancedIntent(
            original_intent=user_text,
            enhanced_intent=enhanced_intent,
            intent_type="plan_based",
            confidence=0.9,
            context={
                "plan_files": plan_files,
                "technical_stack": list(tech_stack),
                "project_structure": project_state.project_structure
            }
        )
    
    def _complete_reference_intent(self, user_text: str, dialogue_context: DialogueContext,
                                project_state: ProjectState, file_context: Dict[str, Any]) -> EnhancedIntent:
        """补全基于引用的意图"""
        
        # 提取文件引用中的关键信息
        file_key_points = []
        if file_context:
            for mentioned_file in file_context.get("mentioned_files", []):
                key_points = mentioned_file.get("key_points", [])
                file_key_points.extend(key_points[:2])  # 每个文件最多取2个关键点
        
        enhanced_intent = f"基于文件参考执行任务，涉及关键点：{', '.join(file_key_points[:3])}"
        
        return EnhancedIntent(
            original_intent=user_text,
            enhanced_intent=enhanced_intent,
            intent_type="reference_based",
            confidence=0.8,
            context={
                "file_key_points": file_key_points,
                "technical_stack": list(project_state.technical_stack)
            }
        )
    
    def _complete_implementation_intent(self, user_text: str, dialogue_context: DialogueContext,
                                     project_state: ProjectState, file_context: Dict[str, Any]) -> EnhancedIntent:
        """补全基于实现的意图"""
        
        # 基于技术栈生成实现建议
        tech_stack = project_state.technical_stack
        
        enhanced_intent = f"开始实现功能，使用技术栈：{', '.join(list(tech_stack)[:3])}"
        
        # 添加项目结构信息
        if project_state.project_structure:
            enhanced_intent += f"，项目结构：{project_state.project_structure}"
        
        return EnhancedIntent(
            original_intent=user_text,
            enhanced_intent=enhanced_intent,
            intent_type="implementation_based",
            confidence=0.85,
            context={
                "technical_stack": list(tech_stack),
                "project_structure": project_state.project_structure
            }
        )
    
    def _default_handler(self, user_text: str, dialogue_context: DialogueContext,
                        project_state: ProjectState, file_context: Dict[str, Any]) -> EnhancedIntent:
        """默认处理器"""
        
        # 查询映射
        mapped_query = self._map_query(user_text)
        
        # 基于技术栈增强查询
        tech_stack = project_state.technical_stack
        
        if tech_stack:
            enhanced_intent = f"{mapped_query}，技术栈：{', '.join(list(tech_stack)[:3])}"
        else:
            enhanced_intent = mapped_query
        
        return EnhancedIntent(
            original_intent=user_text,
            enhanced_intent=enhanced_intent,
            intent_type="general",
            confidence=0.6,
            context={
                "mapped_query": mapped_query,
                "technical_stack": list(tech_stack),
                "constraints": project_state.constraints
            }
        )
    
    def _map_query(self, user_text: str) -> str:
        """映射模糊查询"""
        # 模糊查询处理
        for fuzzy_query, mapped_query in self.query_mappings.items():
            if fuzzy_query in user_text:
                return mapped_query
        
        # 直接返回原始查询
        return user_text.strip()
    
    def _calculate_confidence(self, user_text: str, dialogue_context: DialogueContext,
                            project_state: ProjectState) -> float:
        """计算意图置信度"""
        
        base_confidence = 0.6  # 基础置信度
        
        # 对话历史增强
        if dialogue_context.discussion_points:
            base_confidence += 0.1
        
        # 技术栈信息增强
        if project_state.technical_stack:
            base_confidence += 0.1
        
        # 文件上下文增强
        if hasattr(dialogue_context, 'file_context') and dialogue_context.file_context:
            base_confidence += 0.1
        
        # 长度评估
        if len(user_text) > 20:  # 较长的查询通常更具体
            base_confidence += 0.05
        
        return min(base_confidence, 1.0)  # 置信度不超过1.0
    
    def extract_technical_keywords(self, text: str) -> List[str]:
        """从文本中提取技术关键词"""
        keywords = []
        
        # 常见技术关键词
        tech_terms = [
            'react', 'vue', 'angular', 'django', 'flask', 'fastapi',
            'postgresql', 'mysql', 'mongodb', 'redis', 'kafka',
            'docker', 'kubernetes', 'aws', 'gcp', 'azure',
            'javascript', 'typescript', 'python', 'java', 'go',
            'microservices', 'serverless', 'graphql', 'rest', 'grpc',
            'api', 'database', 'frontend', 'backend', 'fullstack'
        ]
        
        text_lower = text.lower()
        for term in tech_terms:
            if term in text_lower:
                keywords.append(term)
        
        return keywords
    
    def extract_action_verbs(self, text: str) -> List[str]:
        """提取动作动词"""
        verbs = []
        
        action_patterns = [
            r'(创建|创建|建立|新建|实现|开发|编写|构建|设计|配置|部署|安装|设置|初始化)',
            r'(分析|研究|调研|了解|学习|探索)',
            r'(修复|解决|优化|改进|提升|完善)',
            r'(添加|增加|集成|包含|引入)',
            r'(删除|移除|重构|重构|重写)',
            r'(测试|验证|检查|确认)'
        ]
        
        for pattern in action_patterns:
            matches = re.findall(pattern, text)
            verbs.extend(matches)
        
        return verbs