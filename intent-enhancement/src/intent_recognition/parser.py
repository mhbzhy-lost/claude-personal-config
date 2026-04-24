"""
Claude Code 日志解析器

用于解析Claude Code的JSON Lines格式日志文件，提取对话、文件引用和技术决策信息
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from uuid import UUID

from .text_path_extractor import TextPathExtractor

@dataclass
class ConversationMessage:
    """对话消息数据结构"""
    role: str  # "user", "assistant", "system"
    content: List[Dict[str, Any]]
    timestamp: str
    uuid: str
    parent_uuid: Optional[str] = None
    session_id: Optional[str] = None
    
@dataclass
class FileReference:
    """文件引用数据结构"""
    file_path: str
    content: Optional[str]
    timestamp: str
    file_type: str
    purpose: str  # "mentioned", "read", "edited", "created"
    
@dataclass
class ToolCall:
    """工具调用数据结构"""
    tool_name: str
    arguments: Dict[str, Any]
    timestamp: str
    result: Optional[Any] = None
    
@dataclass
class ConversationSession:
    """会话数据结构"""
    session_id: str
    messages: List[ConversationMessage] = field(default_factory=list)
    file_references: List[FileReference] = field(default_factory=list)
    tool_calls: List[ToolCall] = field(default_factory=list)
    technical_decisions: List[Dict[str, Any]] = field(default_factory=list)

class ClaudeCodeLogParser:
    """Claude Code日志解析器"""
    
    def __init__(
        self,
        log_directory: Optional[str] = None,
        text_path_extractor: Optional[TextPathExtractor] = None,
        prose_extraction_cwd: Optional[str] = None,
    ):
        """
        初始化日志解析器

        Args:
            log_directory: 日志文件目录，默认为 ~/.claude/projects
            text_path_extractor: 行文路径抽取器。未传入时按 `prose_extraction_cwd`
                （未传则 os.getcwd()）惰性构造默认 extractor。
            prose_extraction_cwd: 默认 extractor 使用的项目根，仅在未显式传入
                `text_path_extractor` 时生效。
        """
        self.log_dir = Path(log_directory) if log_directory else Path.home() / ".claude" / "projects"
        self.current_session = None
        self.text_path_extractor = text_path_extractor or TextPathExtractor(
            cwd=prose_extraction_cwd,
        )
        # 同一个 session 内记录已抽取过的 (file_path) 以避免重复 append
        self._prose_seen: set[tuple[str, str]] = set()
        
    def parse_conversation(self, session_id: str) -> ConversationSession:
        """
        解析指定会话的完整对话
        
        Args:
            session_id: 会话ID
            
        Returns:
            ConversationSession: 解析后的会话数据
        """
        log_file = self.log_dir / f"{session_id}.jsonl"
        
        if not log_file.exists():
            raise FileNotFoundError(f"日志文件不存在: {log_file}")
        
        session = ConversationSession(session_id=session_id)
        
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    try:
                        event = json.loads(line.strip())
                        self._process_event(session, event)
                    except json.JSONDecodeError as e:
                        print(f"警告：第{line_num}行JSON解析失败: {e}")
                        continue
                        
        except Exception as e:
            print(f"错误：解析日志文件失败 {log_file}: {e}")
            raise
            
        return session
    
    def _process_event(self, session: ConversationSession, event: Dict[str, Any]):
        """处理单个事件"""
        event_type = event.get("type")
        
        if event_type == "user":
            message = self._parse_user_message(event)
            session.messages.append(message)
            self._harvest_prose_paths(session, message, event.get("timestamp", ""))

        elif event_type == "assistant":
            message = self._parse_assistant_message(event)
            session.messages.append(message)
            self._harvest_prose_paths(session, message, event.get("timestamp", ""))
            
        elif event_type == "attachment":
            attachment = event.get("attachment", {})
            if attachment.get("type") == "file":
                file_ref = self._parse_file_reference(attachment, event.get("timestamp"))
                session.file_references.append(file_ref)
                
        elif event_type == "system" and event.get("subtype") == "deferred_tools_delta":
            # 工具定义变更
            self._process_tools_delta(event, session)
    
    def _parse_user_message(self, event: Dict[str, Any]) -> ConversationMessage:
        """解析用户消息"""
        message_data = event.get("message", {})
        
        # 处理content数组
        content = message_data.get("content", [])
        if isinstance(content, list):
            # 可能是复杂的content结构
            processed_content = []
            for item in content:
                if isinstance(item, dict):
                    processed_content.append(item)
                else:
                    processed_content.append({"type": "text", "text": str(item)})
        else:
            processed_content = [{"type": "text", "text": str(content)}]
        
        return ConversationMessage(
            role="user",
            content=processed_content,
            timestamp=event.get("timestamp", ""),
            uuid=event.get("uuid", ""),
            parent_uuid=event.get("parentUuid"),
            session_id=event.get("sessionId")
        )
    
    def _parse_assistant_message(self, event: Dict[str, Any]) -> ConversationMessage:
        """解析助手消息"""
        message_data = event.get("message", {})
        content = message_data.get("content", [])
        
        # 处理复杂的content结构（可能包含thinking、text、tool_use等）
        processed_content = []
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    processed_content.append(item)
                else:
                    processed_content.append({"type": "text", "text": str(item)})
        else:
            processed_content = [{"type": "text", "text": str(content)}]
        
        return ConversationMessage(
            role="assistant",
            content=processed_content,
            timestamp=event.get("timestamp", ""),
            uuid=event.get("uuid", ""),
            parent_uuid=event.get("parentUuid"),
            session_id=event.get("sessionId")
        )
    
    def _harvest_prose_paths(
        self,
        session: ConversationSession,
        message: ConversationMessage,
        timestamp: str,
    ) -> None:
        """从消息 text 字段中抽取行文路径并补充到 session.file_references.

        不改动现有 `@path` / attachment 流 —— 这里仅新增 source='prose' 类型
        的 FileReference 条目，与 attachment 产生的条目共用同一份 schema，
        analyzer.py::analyze_files 无需改动即可消费。
        """
        text_parts: List[str] = []
        for item in message.content:
            if not isinstance(item, dict):
                continue
            t = item.get("type")
            if t == "text" and isinstance(item.get("text"), str):
                text_parts.append(item["text"])
            elif t == "thinking" and isinstance(item.get("thinking"), str):
                text_parts.append(item["thinking"])
        if not text_parts:
            return

        combined = "\n".join(text_parts)
        try:
            extracted = self.text_path_extractor.extract(combined)
        except Exception as e:  # 抽取永远不该打断解析
            print(f"警告：行文路径抽取失败: {e}")
            return

        for ep in extracted:
            key = (message.uuid or "", ep.absolute)
            if key in self._prose_seen:
                continue
            self._prose_seen.add(key)

            file_type = self._identify_file_type(ep.path)
            session.file_references.append(FileReference(
                file_path=ep.path,
                content=None,  # 行文抽取不加载文件内容
                timestamp=timestamp,
                file_type=file_type,
                purpose="mentioned",
            ))

    def _parse_file_reference(self, attachment: Dict[str, Any], timestamp: str) -> FileReference:
        """解析文件引用"""
        filename = attachment.get("filename")
        content_data = attachment.get("content", {})
        
        # 提取文件内容
        file_content = None
        if isinstance(content_data, dict) and "content" in content_data:
            file_content = content_data["content"]
        elif isinstance(content_data, str):
            file_content = content_data
        
        # 识别文件类型
        file_type = self._identify_file_type(filename, file_content)
        
        # 推断文件用途
        purpose = self._infer_file_purpose(attachment)
        
        return FileReference(
            file_path=filename,
            content=file_content,
            timestamp=timestamp,
            file_type=file_type,
            purpose=purpose
        )
    
    def _identify_file_type(self, filename: str, content: Optional[str] = None) -> str:
        """识别文件类型"""
        ext = Path(filename).suffix.lower()
        
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
            '.ini': 'ini',
            '.txt': 'text',
            '.md': 'markdown'
        }
        
        return type_mapping.get(ext, 'unknown')
    
    def _infer_file_purpose(self, attachment: Dict[str, Any]) -> str:
        """推断文件用途"""
        filename = attachment.get("filename", "")
        content_type = attachment.get("type", "")
        
        # 基于文件名推断用途
        if 'claude' in filename.lower():
            return 'configuration'
        elif 'plan' in filename.lower():
            return 'planning'
        elif 'readme' in filename.lower() or 'doc' in filename.lower():
            return 'documentation'
        elif filename.endswith('.md'):
            return 'documentation'
        elif filename.endswith('.json'):
            return 'configuration'
        elif any(keyword in filename.lower() for keyword in ['skill', 'config', 'setting']):
            return 'configuration'
        else:
            return 'reference'
    
    def _process_tools_delta(self, event: Dict[str, Any], session: ConversationSession):
        """处理工具定义变更"""
        attachment = event.get("attachment", {})
        
        if "addedNames" in attachment:
            # 记录新增的工具
            for tool_name in attachment["addedNames"]:
                session.tool_calls.append(ToolCall(
                    tool_name=tool_name,
                    arguments={},
                    timestamp=event.get("timestamp", ""),
                    result=None
                ))
    
    def get_latest_sessions(self, limit: int = 10) -> List[str]:
        """获取最新的会话ID列表"""
        if not self.log_dir.exists():
            return []
        
        jsonl_files = list(self.log_dir.glob("*.jsonl"))
        
        # 按修改时间排序
        jsonl_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        
        # 提取会话ID（去掉.jsonl扩展名）
        session_ids = [f.stem for f in jsonl_files[:limit]]
        
        return session_ids
    
    def validate_session(self, session_id: str) -> bool:
        """验证会话是否存在"""
        log_file = self.log_dir / f"{session_id}.jsonl"
        return log_file.exists() and log_file.stat().st_size > 0