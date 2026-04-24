"""
增强技能解析器

整合意图识别和混合检索的核心集成组件
"""

import time
import yaml
from dataclasses import dataclass, field, asdict, is_dataclass
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

from intent_recognition import IntentRecognitionEngine, RecognitionResult
from retrieval import HybridRetrievalEngine, SkillDependencyGraph, SkillRanker, SearchResult
from utils.config import get_config, IntentEnhancementConfig

@dataclass
class EnhancedResolutionResult:
    """增强解析结果"""
    skills: List[Dict[str, Any]]
    enhanced_intent: str
    original_intent: str
    intent_confidence: float
    technical_context: Dict[str, Any]
    confidence: float
    processing_time: float
    used_cache: bool
    dependency_analysis: Dict[str, Any]

class EnhancedSkillResolver:
    """增强技能解析器"""
    
    def __init__(self, config: Optional[IntentEnhancementConfig] = None):
        """初始化增强技能解析器"""
        self.config = config or get_config()
        self.intent_engine = IntentRecognitionEngine(
            log_directory=self.config.claude_code.log_directory
        )
        self.retrieval_engine = None
        self.dependency_graph = SkillDependencyGraph()
        self.skill_ranker = SkillRanker(self.dependency_graph)
        self.skill_catalog_data = []
    
    def load_skill_catalog(self, catalog_path: str):
        """加载技能目录"""
        catalog_file = Path(catalog_path)
        if catalog_file.is_file():
            import json
            with open(catalog_file, 'r', encoding='utf-8') as f:
                self.skill_catalog_data = json.load(f)
        elif catalog_file.is_dir():
            self.skill_catalog_data = self._scan_skill_directory(catalog_file)
        else:
            raise ValueError(f"无效的技能目录路径: {catalog_path}")
        self.retrieval_engine = HybridRetrievalEngine(self.skill_catalog_data)
    
    def _scan_skill_directory(self, directory: Path) -> List[Dict[str, Any]]:
        """扫描技能目录"""
        skills = []
        for skill_dir in directory.rglob('SKILL.md'):
            skill_info = self._parse_skill_file(skill_dir)
            if skill_info:
                skills.append(skill_info)
        return skills
    
    def _parse_skill_file(self, file_path: Path) -> Optional[Dict[str, Any]]:
        """解析SKILL.md文件"""
        try:
            import re
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            frontmatter_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)  # 修复正则表达式
            if frontmatter_match:
                frontmatter_text = frontmatter_match.group(1)
                import yaml
                frontmatter = yaml.safe_load(frontmatter_text)
                body = content.split('---', 2)[2].strip()
                frontmatter['file_path'] = str(file_path)
                frontmatter['directory'] = str(file_path.parent)
                return frontmatter
        except Exception as e:
            print(f"解析技能文件失败 {file_path}: {e}")
            return None
    
    def resolve(self, user_prompt: str, cwd: str, conversation_id: str = None,
               tech_stack: List[str] = None, capability: List[str] = None,
               language: List[str] = None, top_n: int = None) -> EnhancedResolutionResult:
        """解析用户意图并检索相关技能"""
        start_time = time.time()
        
        try:
            recognition_result = self._recognize_intent(user_prompt, cwd, conversation_id)
            search_context = self._build_search_context(recognition_result, cwd)
            
            top_n = top_n or self.config.retrieval.top_n
            search_result = self._search_skills(user_prompt, recognition_result.enhanced_intent.enhanced_intent,
                                             tech_stack, capability, language, top_n, search_context)

            # HybridRetrievalEngine.search 的缓存命中分支返回 dict 列表，非缓存
            # 分支返回 SkillResult dataclass 列表。在这里统一规范为 dict，下游
            # ranker/dependency 按 dict 访问。
            skill_dicts: List[Dict[str, Any]] = []
            for s in search_result.skills:
                if isinstance(s, dict):
                    skill_dicts.append(s)
                elif is_dataclass(s):
                    skill_dicts.append(asdict(s))
                else:
                    skill_dicts.append({
                        'name': getattr(s, 'name', ''),
                        'description': getattr(s, 'description', ''),
                    })

            if self.config.retrieval.enable_dependency_analysis:
                ranked_skills = self._rank_skills_with_dependencies(skill_dicts, search_context)
            else:
                ranked_skills = skill_dicts
            
            processing_time = time.time() - start_time
            
            return EnhancedResolutionResult(
                skills=ranked_skills,
                enhanced_intent=recognition_result.enhanced_intent.enhanced_intent,
                original_intent=recognition_result.enhanced_intent.original_intent,
                intent_confidence=recognition_result.enhanced_intent.confidence,
                technical_context=self._extract_technical_context(recognition_result),
                confidence=recognition_result.confidence,
                processing_time=processing_time,
                used_cache=search_result.used_cache,
                dependency_analysis=self._get_dependency_analysis(ranked_skills, search_context)
            )
        except Exception as e:
            import logging, traceback
            logging.getLogger(__name__).warning(
                "增强解析失败，走 fallback: %s\n%s", e, traceback.format_exc()
            )
            return self._create_fallback_result(user_prompt, start_time, e)
    
    def _recognize_intent(self, user_prompt: str, cwd: str, conversation_id: str = None) -> RecognitionResult:
        if conversation_id and self.config.intent.cache_enabled:
            return self.intent_engine.understand_intent(conversation_id, cwd, user_prompt)
        else:
            from intent_recognition import DialogueContext, ProjectState, TechnicalInfo, EnhancedIntent
            return RecognitionResult(
                enhanced_intent=EnhancedIntent(
                    original_intent=user_prompt,
                    enhanced_intent=user_prompt,
                    intent_type="general",
                    confidence=0.6
                ),
                dialogue_context=DialogueContext(),
                project_state=ProjectState(),
                technical_info=TechnicalInfo(),
                confidence=0.6,
                processing_time=0.0
            )
    
    def _build_search_context(self, recognition_result: RecognitionResult, cwd: str) -> Dict[str, Any]:
        return {
            'technical_stack': list(recognition_result.technical_info.frameworks | recognition_result.technical_info.languages),
            'requirements': recognition_result.dialogue_context.discussion_points,
            'constraints': recognition_result.project_state.constraints,
            'current_directory': cwd
        }
    
    def _search_skills(self, original_query: str, enhanced_query: str, tech_stack: List[str], 
                     capability: List[str], language: List[str], top_n: int, 
                     context: Dict[str, Any]) -> SearchResult:
        if not self.retrieval_engine:
            raise ValueError("技能目录未加载，请先调用 load_skill_catalog()")
        return self.retrieval_engine.search(enhanced_query, tech_stack, capability, language, top_n, context)
    
    def _rank_skills_with_dependencies(self, skills: List[Dict[str, Any]], context: Dict[str, Any]) -> List[Dict[str, Any]]:
        if self.config.retrieval.enable_dependency_analysis:
            return self.skill_ranker.rank_skills(skills, context)
        return skills
    
    def _extract_technical_context(self, recognition_result: RecognitionResult) -> Dict[str, Any]:
        return {
            'technical_stack': {
                'frameworks': list(recognition_result.technical_info.frameworks),
                'languages': list(recognition_result.technical_info.languages),
                'databases': list(recognition_result.technical_info.databases),
                'tools': list(recognition_result.technical_info.tools)
            },
            'discussion_points': recognition_result.dialogue_context.discussion_points,
            'technical_constraints': recognition_result.dialogue_context.technical_constraints
        }
    
    def _get_dependency_analysis(self, skills: List[Dict[str, Any]], context: Dict[str, Any]) -> Dict[str, Any]:
        if not self.config.retrieval.enable_dependency_analysis:
            return {}
        skill_names = [skill.get('name', '') for skill in skills]
        analysis = self.dependency_graph.analyze_dependencies(skill_names)
        return {
            'has_conflicts': analysis.has_conflicts,
            'missing_dependencies': analysis.missing_dependencies,
            'conflict_details': analysis.conflict_details,
            'recommended_skills': analysis.recommended_skills
        }
    
    def _create_fallback_result(self, user_prompt: str, start_time: float, error: Exception) -> EnhancedResolutionResult:
        return EnhancedResolutionResult(
            skills=[],
            enhanced_intent=user_prompt,
            original_intent=user_prompt,
            intent_confidence=0.0,
            technical_context={},
            confidence=0.0,
            processing_time=time.time() - start_time,
            used_cache=False,
            dependency_analysis={'error': str(error)}
        )
    
    def get_stats(self) -> Dict[str, Any]:
        """获取系统统计信息"""
        return {
            'total_skills': len(self.skill_catalog_data),
            'retrieval_enabled': self.retrieval_engine is not None
        }
    
    def clear_cache(self):
        """清除所有缓存"""
        self.intent_engine.clear_cache()
        if self.retrieval_engine:
            self.retrieval_engine.clear_cache()
    
    def reload_config(self):
        """重新加载配置"""
        from utils.config import get_config_manager
        config_manager = get_config_manager()
        self.config = config_manager.reload_config()
