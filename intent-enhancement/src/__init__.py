"""
意图增强技能检索系统

基于Claude Code日志和混合检索引擎的技能推荐系统
"""

__version__ = "1.0.0"
__author__ = "Intent Enhancement Team"

from .intent_recognition import IntentRecognitionEngine
from .retrieval import HybridRetrievalEngine
from .integration import EnhancedSkillResolver

__all__ = [
    "IntentRecognitionEngine",
    "HybridRetrievalEngine", 
    "EnhancedSkillResolver"
]