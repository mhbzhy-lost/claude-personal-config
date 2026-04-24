"""
意图识别引擎

整合日志解析、文件分析、上下文追踪和意图补全的完整意图识别系统
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, field

from .parser import ClaudeCodeLogParser, ConversationSession, ConversationMessage, FileReference
from .analyzer import FileReferenceAnalyzer, FileContext, TechnicalInfo
from .completer import IntentCompleter, DialogueContext, ProjectState, EnhancedIntent

@dataclass
class RecognitionResult:
    """识别结果"""
    enhanced_intent: EnhancedIntent
    dialogue_context: DialogueContext
    project_state: ProjectState
    technical_info: TechnicalInfo
    confidence: float
    processing_time: float

class IntentRecognitionEngine:
    """意图识别引擎"""
    
    def __init__(self, log_directory: Optional[str] = None):
        """
        初始化意图识别引擎
        
        Args:
            log_directory: Claude Code日志目录，默认为 ~/.claude/projects
        """
        self.log_parser = ClaudeCodeLogParser(log_directory)
        self.file_analyzer = FileReferenceAnalyzer()
        self.intent_completer = IntentCompleter()
        
        # 缓存
        self.session_cache = {}
        self.context_cache = {}
        
        # 配置
        self.cache_enabled = True
        self.cache_timeout = 3600  # 1小时
        
    def understand_intent(self, 
                         conversation_id: str, 
                         cwd: str,
                         user_prompt: str = None,
                         use_cache: bool = True) -> RecognitionResult:
        """
        理解用户意图
        
        Args:
            conversation_id: 会话ID
            cwd: 当前工作目录
            user_prompt: 用户提示（可选）
            use_cache: 是否使用缓存
            
        Returns:
            RecognitionResult: 意识识别结果
        """
        start_time = datetime.now()
        
        try:
            # 检查缓存
            if use_cache and self.cache_enabled:
                cached_result = self._get_cached_result(conversation_id)
                if cached_result:
                    return cached_result
            
            # 1. 解析对话日志
            session = self._parse_conversation_with_cache(conversation_id)
            
            # 2. 分析文件上下文
            file_context = self.file_analyzer.analyze_files(session.file_references)
            
            # 3. 构建对话上下文
            dialogue_context = self._build_dialogue_context(session)
            
            # 4. 追踪项目状态
            project_state = self._track_project_state(session, file_context, cwd)
            
            # 5. 技术信息提取
            technical_info = self.file_analyzer.get_technical_info(file_context)
            
            # 6. 意图补全
            if user_prompt:
                enhanced_intent = self.intent_completer.complete_intent(
                    user_prompt,
                    dialogue_context,
                    project_state,
                    self._file_context_to_dict(file_context)
                )
            else:
                # 如果没有用户提示，基于最新消息生成默认意图
                latest_message = session.messages[-1] if session.messages else None
                user_prompt = self._extract_text_from_message(latest_message) if latest_message else ""
                
                enhanced_intent = self.intent_completer.complete_intent(
                    user_prompt,
                    dialogue_context,
                    project_state,
                    self._file_context_to_dict(file_context)
                )
            
            # 7. 计算总体置信度
            overall_confidence = self._calculate_overall_confidence(
                enhanced_intent, dialogue_context, project_state, file_context
            )
            
            # 8. 构建结果
            result = RecognitionResult(
                enhanced_intent=enhanced_intent,
                dialogue_context=dialogue_context,
                project_state=project_state,
                technical_info=technical_info,
                confidence=overall_confidence,
                processing_time=(datetime.now() - start_time).total_seconds()
            )
            
            # 缓存结果
            if use_cache and self.cache_enabled:
                self._cache_result(conversation_id, result)
            
            return result
            
        except Exception as e:
            print(f"意图识别失败: {e}")
            # 返回默认结果
            return self._create_default_result(user_prompt, start_time)
    
    def _parse_conversation_with_cache(self, conversation_id: str) -> ConversationSession:
        """使用缓存的会话解析"""
        cache_key = f"session_{conversation_id}"
        
        if cache_key in self.session_cache:
            cached_session = self.session_cache[cache_key]
            # 检查缓存是否过期
            if datetime.now().timestamp() - cached_session['timestamp'] < self.cache_timeout:
                return cached_session['data']
        
        # 解析会话
        session = self.log_parser.parse_conversation(conversation_id)
        
        # 缓存结果
        if self.cache_enabled:
            self.session_cache[cache_key] = {
                'data': session,
                'timestamp': datetime.now().timestamp()
            }
        
        return session
    
    def _build_dialogue_context(self, session: ConversationSession) -> DialogueContext:
        """构建对话上下文"""
        context = DialogueContext()
        
        for message in session.messages:
            if message.role == "user":
                # 提取技术讨论点
                discussion_points = self._extract_discussion_points(message)
                context.discussion_points.extend(discussion_points)
                
                # 提取约束条件
                constraints = self._extract_constraints(message)
                context.technical_constraints.extend(constraints)
                
                # 提取用户偏好
                preferences = self._extract_preferences(message)
                context.preferences.extend(preferences)
                
            elif message.role == "assistant":
                # 记录技术决策
                decisions = self._extract_decisions(message)
                context.decisions_made.extend(decisions)
        
        return context
    
    def _track_project_state(self, session: ConversationSession, 
                           file_context: FileContext, cwd: str) -> ProjectState:
        """追踪项目状态"""
        state = ProjectState()
        
        # 更新技术栈
        state.technical_stack = file_context.technical_stack
        
        # 更新项目结构
        state.project_structure = file_context.project_structure
        
        # 更新约束条件
        state.constraints = file_context.requirements + file_context.dependencies
        
        # 更新决策路径
        state.decision_path = session.technical_decisions
        
        # 添加当前目录信息
        state.project_structure['current_directory'] = cwd
        
        return state
    
    def _extract_discussion_points(self, message: ConversationMessage) -> List[str]:
        """提取讨论点"""
        points = []
        
        content_text = self._extract_text_from_message(message)
        
        # 基于关键词提取讨论点
        discussion_keywords = [
            '需要', '打算', '计划', '准备', '考虑', '想',
            '应该', '必须', '要求', '目标', '目的'
        ]
        
        for keyword in discussion_keywords:
            if keyword in content_text:
                # 提取包含关键词的句子
                sentences = self._extract_sentences_with_keyword(content_text, keyword)
                points.extend(sentences)
        
        # 提取技术讨论
        tech_discussions = self._extract_tech_discussions(content_text)
        points.extend(tech_discussions)
        
        return points
    
    def _extract_constraints(self, message: ConversationMessage) -> List[str]:
        """提取约束条件"""
        constraints = []
        
        content_text = self._extract_text_from_message(message)
        
        # 约束关键词
        constraint_keywords = [
            '限制', '约束', '要求', '必须', '不能', '禁止',
            '避免', '不要', '需要', '应该'
        ]
        
        for keyword in constraint_keywords:
            if keyword in content_text:
                sentences = self._extract_sentences_with_keyword(content_text, keyword)
                constraints.extend(sentences)
        
        return constraints
    
    def _extract_preferences(self, message: ConversationMessage) -> List[str]:
        """提取用户偏好"""
        preferences = []
        
        content_text = self._extract_text_from_message(message)
        
        # 偏好关键词
        preference_keywords = [
            '喜欢', '偏好', '倾向于', '推荐', '建议', '最好',
            '优先', '更倾向于', '希望', '期望'
        ]
        
        for keyword in preference_keywords:
            if keyword in content_text:
                sentences = self._extract_sentences_with_keyword(content_text, keyword)
                preferences.extend(sentences)
        
        return preferences
    
    def _extract_decisions(self, message: ConversationMessage) -> List[str]:
        """提取技术决策"""
        decisions = []
        
        content_text = self._extract_text_from_message(message)
        
        # 决策模式
        decision_patterns = [
            r'决定使用(.+)',
            r'选择(.+)',
            r'采用(.+)',
            r'确定使用(.+)',
            r'计划(.+)',
            r'将使用(.+)'
        ]
        
        for pattern in decision_patterns:
            matches = re.findall(pattern, content_text, re.IGNORECASE)
            decisions.extend(matches)
        
        return decisions
    
    def _extract_tech_discussions(self, text: str) -> List[str]:
        """提取技术讨论"""
        discussions = []
        
        # 技术相关讨论模式
        tech_patterns = [
            r'(.+技术)',
            r'(使用.+)',
            r'(集成.+)',
            r'(实现.+)',
            r'(开发.+)',
            r'(设计.+)'
        ]
        
        for pattern in tech_patterns:
            matches = re.findall(pattern, text)
            discussions.extend(matches)
        
        return discussions
    
    def _extract_sentences_with_keyword(self, text: str, keyword: str) -> List[str]:
        """提取包含关键词的句子"""
        sentences = re.findall(rf'[^.!?]*{keyword}[^.!?]*[.!?]', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def _extract_text_from_message(self, message: Optional[ConversationMessage]) -> str:
        """从消息中提取文本"""
        if not message:
            return ""
        
        text_parts = []
        for content in message.content:
            if isinstance(content, dict):
                if content.get("type") == "text":
                    text_parts.append(content.get("text", ""))
                elif content.get("type") == "tool_use":
                    text_parts.append(f"工具调用: {content.get('name', 'unknown')}")
        
        return " ".join(text_parts)
    
    def _file_context_to_dict(self, file_context: FileContext) -> Dict[str, Any]:
        """将文件上下文转换为字典"""
        return {
            "mentioned_files": file_context.mentioned_files,
            "project_structure": file_context.project_structure,
            "technical_stack": list(file_context.technical_stack),
            "code_patterns": file_context.code_patterns,
            "requirements": file_context.requirements,
            "dependencies": file_context.dependencies
        }
    
    def _calculate_overall_confidence(self, enhanced_intent: EnhancedIntent,
                                    dialogue_context: DialogueContext,
                                    project_state: ProjectState,
                                    file_context: FileContext) -> float:
        """计算总体置信度"""
        
        # 基础置信度
        base_confidence = enhanced_intent.confidence
        
        # 对话上下文增强
        dialogue_boost = 0.0
        if dialogue_context.discussion_points:
            dialogue_boost += 0.1
        if dialogue_context.technical_constraints:
            dialogue_boost += 0.05
        
        # 项目状态增强
        project_boost = 0.0
        if project_state.technical_stack:
            project_boost += 0.1
        if project_state.constraints:
            project_boost += 0.05
        
        # 文件上下文增强
        file_boost = 0.0
        if file_context.mentioned_files:
            file_boost += 0.05
        if file_context.requirements:
            file_boost += 0.05
        
        # 计算最终置信度
        overall_confidence = base_confidence + dialogue_boost + project_boost + file_boost
        return min(overall_confidence, 1.0)  # 确保不超过1.0
    
    def _get_cached_result(self, conversation_id: str) -> Optional[RecognitionResult]:
        """获取缓存结果"""
        cache_key = f"result_{conversation_id}"
        if cache_key in self.context_cache:
            cached_data = self.context_cache[cache_key]
            if datetime.now().timestamp() - cached_data['timestamp'] < self.cache_timeout:
                return cached_data['data']
        return None
    
    def _cache_result(self, conversation_id: str, result: RecognitionResult):
        """缓存结果"""
        cache_key = f"result_{conversation_id}"
        self.context_cache[cache_key] = {
            'data': result,
            'timestamp': datetime.now().timestamp()
        }
    
    def _create_default_result(self, user_prompt: str, start_time: datetime) -> RecognitionResult:
        """创建默认结果"""
        return RecognitionResult(
            enhanced_intent=EnhancedIntent(
                original_intent=user_prompt or "",
                enhanced_intent="请提供具体的技术需求",
                intent_type="empty",
                confidence=0.0
            ),
            dialogue_context=DialogueContext(),
            project_state=ProjectState(),
            technical_info=TechnicalInfo(),
            confidence=0.0,
            processing_time=(datetime.now() - start_time).total_seconds()
        )
    
    def clear_cache(self):
        """清除缓存"""
        self.session_cache.clear()
        self.context_cache.clear()
    
    def get_cache_status(self) -> Dict[str, int]:
        """获取缓存状态"""
        return {
            "session_cache_size": len(self.session_cache),
            "context_cache_size": len(self.context_cache),
            "cache_enabled": self.cache_enabled
        }
    
    def get_latest_sessions(self, limit: int = 10) -> List[str]:
        """获取最新的会话ID列表"""
        return self.log_parser.get_latest_sessions(limit)
    
    def validate_conversation(self, conversation_id: str) -> bool:
        """验证会话是否存在"""
        return self.log_parser.validate_session(conversation_id)