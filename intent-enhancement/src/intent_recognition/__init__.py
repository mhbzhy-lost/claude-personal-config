"""
意图识别模块

基于Claude Code日志的多维度意图理解系统
"""

from .engine import IntentRecognitionEngine, RecognitionResult
from .parser import ClaudeCodeLogParser
from .analyzer import FileReferenceAnalyzer, FileContext, TechnicalInfo
from .completer import IntentCompleter, DialogueContext, ProjectState, EnhancedIntent

__all__ = [
    "IntentRecognitionEngine",
    "RecognitionResult",
    "ClaudeCodeLogParser",
    "FileReferenceAnalyzer",
    "FileContext",
    "TechnicalInfo",
    "IntentCompleter",
    "DialogueContext",
    "ProjectState",
    "EnhancedIntent",
]