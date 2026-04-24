"""
配置管理

管理意图增强系统的配置参数
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field, asdict

@dataclass
class CacheConfig:
    """缓存配置"""
    enabled: bool = True
    ttl: int = 3600  # 缓存过期时间（秒）
    max_size: int = 1000  # 最大缓存条目数
    strategy: str = "memory"  # 缓存策略: memory, redis, file

@dataclass
class IntentConfig:
    """意图识别配置"""
    cache_enabled: bool = True
    min_confidence: float = 0.5  # 最小置信度阈值
    enable_pattern_matching: bool = True
    enable_context_enhancement: bool = True
    max_processing_time: float = 5.0  # 最大处理时间（秒）

@dataclass
class RetrievalConfig:
    """检索配置"""
    cache_enabled: bool = True
    top_n: int = 10  # 默认返回结果数量
    enable_keyword_filter: bool = True
    enable_rule_matching: bool = True
    enable_vector_search: bool = True
    enable_dependency_analysis: bool = True
    min_similarity: float = 0.3  # 最小相似度阈值

@dataclass
class ClaudeCodeConfig:
    """Claude Code日志配置"""
    log_directory: Optional[str] = None  # 日志目录
    auto_detect: bool = True  # 自动检测日志目录
    max_session_age: int = 86400  # 最大会话年龄（秒）

@dataclass
class IntentEnhancementConfig:
    """意图增强系统总配置"""
    cache: CacheConfig = field(default_factory=CacheConfig)
    intent: IntentConfig = field(default_factory=IntentConfig)
    retrieval: RetrievalConfig = field(default_factory=RetrievalConfig)
    claude_code: ClaudeCodeConfig = field(default_factory=ClaudeCodeConfig)
    debug_mode: bool = False
    log_level: str = "INFO"
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'IntentEnhancementConfig':
        """从字典创建"""
        # 处理嵌套配置
        cache_data = data.get('cache', {})
        intent_data = data.get('intent', {})
        retrieval_data = data.get('retrieval', {})
        claude_code_data = data.get('claude_code', {})
        
        return cls(
            cache=CacheConfig(**cache_data),
            intent=IntentConfig(**intent_data),
            retrieval=RetrievalConfig(**retrieval_data),
            claude_code=ClaudeCodeConfig(**claude_code_data),
            debug_mode=data.get('debug_mode', False),
            log_level=data.get('log_level', 'INFO')
        )

class ConfigManager:
    """配置管理器"""
    
    def __init__(self, config_path: Optional[str] = None):
        """
        初始化配置管理器
        
        Args:
            config_path: 配置文件路径，默认为 intent-enhancement/config.json
        """
        if config_path:
            self.config_path = Path(config_path)
        else:
            # 默认配置文件路径
            self.config_path = Path(__file__).parent.parent.parent / "config" / "config.json"
        
        self.config = self._load_config()
    
    def _load_config(self) -> IntentEnhancementConfig:
        """加载配置"""
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                return IntentEnhancementConfig.from_dict(data)
            except Exception as e:
                print(f"加载配置文件失败: {e}，使用默认配置")
        
        # 使用默认配置
        return IntentEnhancementConfig()
    
    def save_config(self):
        """保存配置"""
        try:
            # 确保目录存在
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(self.config.to_dict(), f, indent=2, ensure_ascii=False)
            
            return True
        except Exception as e:
            print(f"保存配置文件失败: {e}")
            return False
    
    def get_config(self) -> IntentEnhancementConfig:
        """获取当前配置"""
        return self.config
    
    def update_config(self, updates: Dict[str, Any]):
        """更新配置"""
        
        # 更新缓存配置
        if 'cache' in updates:
            for key, value in updates['cache'].items():
                if hasattr(self.config.cache, key):
                    setattr(self.config.cache, key, value)
        
        # 更新意图配置
        if 'intent' in updates:
            for key, value in updates['intent'].items():
                if hasattr(self.config.intent, key):
                    setattr(self.config.intent, key, value)
        
        # 更新检索配置
        if 'retrieval' in updates:
            for key, value in updates['retrieval'].items():
                if hasattr(self.config.retrieval, key):
                    setattr(self.config.retrieval, key, value)
        
        # 更新Claude Code配置
        if 'claude_code' in updates:
            for key, value in updates['claude_code'].items():
                if hasattr(self.config.claude_code, key):
                    setattr(self.config.claude_code, key, value)
        
        # 更新顶级配置
        for key in ['debug_mode', 'log_level']:
            if key in updates:
                setattr(self.config, key, updates[key])
    
    def reload_config(self):
        """重新加载配置"""
        self.config = self._load_config()
        return self.config
    
    def get_claude_code_log_dir(self) -> str:
        """获取Claude Code日志目录"""
        if self.config.claude_code.log_directory:
            return self.config.claude_code.log_directory
        
        if self.config.claude_code.auto_detect:
            # 自动检测默认日志目录
            default_dir = Path.home() / ".claude" / "projects"
            if default_dir.exists():
                return str(default_dir)
        
        raise FileNotFoundError("无法找到Claude Code日志目录，请配置claude_code.log_directory")
    
    def create_default_config(self):
        """创建默认配置文件"""
        default_config = IntentEnhancementConfig()
        
        # 创建配置目录
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 写入配置文件
        with open(self.config_path, 'w', encoding='utf-8') as f:
            json.dump(default_config.to_dict(), f, indent=2, ensure_ascii=False)
        
        return default_config

# 全局配置管理器实例
_config_manager = None

def get_config_manager(config_path: Optional[str] = None) -> ConfigManager:
    """获取配置管理器实例"""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager(config_path)
    return _config_manager

def get_config() -> IntentEnhancementConfig:
    """获取当前配置"""
    return get_config_manager().get_config()