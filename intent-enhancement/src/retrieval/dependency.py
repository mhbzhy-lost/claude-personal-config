"""
技能依赖图

管理技能之间的依赖关系、冲突检测和智能推荐
"""

from typing import Dict, List, Set, Optional, Tuple, Any
from dataclasses import dataclass, field
from collections import defaultdict, deque

@dataclass
class SkillDependency:
    """技能依赖关系"""
    skill_name: str
    dependencies: List[str] = field(default_factory=list)
    conflicts: List[str] = field(default_factory=list)
    recommended_combinations: List[List[str]] = field(default_factory=list)
    constraints: List[str] = field(default_factory=list)

@dataclass
class DependencyAnalysis:
    """依赖分析结果"""
    has_conflicts: bool
    missing_dependencies: List[str]
    conflict_details: List[str]
    recommended_skills: List[str]
    dependency_chain: List[str]

class SkillDependencyGraph:
    """技能依赖图"""
    
    def __init__(self):
        # 技能依赖关系
        self.dependencies = {}  # skill -> [dependencies]
        # 技能冲突关系
        self.conflicts = {}  # skill -> [conflicts]
        # 推荐组合
        self.combinations = {}  # combination_name -> [skills]
        # 技能信息
        self.skills_info = {}
        
        # 预定义的依赖关系
        self._load_default_dependencies()
    
    def _load_default_dependencies(self):
        """加载默认依赖关系"""
        
        # Django生态系统
        self.add_dependency('django-drf', ['django-core', 'django-orm-advanced'])
        self.add_dependency('django-auth', ['django-core', 'django-orm-advanced'])
        self.add_dependency('django-rest-framework', ['django-core'])
        self.add_dependency('django-testing', ['django-core'])
        
        # React生态系统
        self.add_dependency('react-router', ['react-core'])
        self.add_dependency('react-redux', ['react-core'])
        self.add_dependency('react-query', ['react-core'])
        
        # 云服务集成
        self.add_dependency('aws-s3', ['aws-sdk'])
        self.add_dependency('aws-lambda', ['aws-sdk'])
        self.add_dependency('gcp-storage', ['gcp-sdk'])
        
        # 数据库集成
        self.add_dependency('postgresql-adapter', ['database-core'])
        self.add_dependency('mongodb-adapter', ['database-core'])
        self.add_dependency('redis-cache', ['database-core'])
        
        # 添加冲突关系
        self.add_conflict('django', ['flask', 'fastapi', 'spring'])
        self.add_conflict('react', ['vue', 'angular'])
        self.add_conflict('postgresql', ['mysql', 'mongodb'])
        self.add_conflict('webpack', ['vite', 'parcel'])
        
        # 添加推荐组合
        self.add_combination('ecommerce', ['django-core', 'django-drf', 'payment', 'user-auth'])
        self.add_combination('blog', ['django-core', 'django-orm-advanced', 'markdown-render'])
        self.add_combination('realtime', ['websocket', 'redis-cache', 'event-bus'])
        self.add_combination('microservice', ['api-gateway', 'service-discovery', 'config-center'])
    
    def add_dependency(self, skill: str, dependencies: List[str]):
        """添加依赖关系"""
        if skill not in self.dependencies:
            self.dependencies[skill] = []
        self.dependencies[skill].extend(dependencies)
    
    def add_conflict(self, skill: str, conflicts: List[str]):
        """添加冲突关系"""
        if skill not in self.conflicts:
            self.conflicts[skill] = []
        self.conflicts[skill].extend(conflicts)
        
        # 冲突是双向的
        for conflict in conflicts:
            if conflict not in self.conflicts:
                self.conflicts[conflict] = []
            if skill not in self.conflicts[conflict]:
                self.conflicts[conflict].append(skill)
    
    def add_combination(self, combination_name: str, skills: List[str]):
        """添加推荐组合"""
        self.combinations[combination_name] = skills
    
    def analyze_dependencies(self, selected_skills: List[str]) -> DependencyAnalysis:
        """
        分析依赖关系
        
        Args:
            selected_skills: 用户选择的技能列表
            
        Returns:
            DependencyAnalysis: 依赖分析结果
        """
        selected_set = set(selected_skills)
        
        # 检查冲突
        conflicts = self._check_conflicts(selected_set)
        
        # 检查缺失依赖
        missing_deps = self._check_missing_dependencies(selected_set)
        
        # 推荐相关技能
        recommended = self._get_recommendations(selected_set)
        
        # 构建依赖链
        dependency_chain = self._build_dependency_chain(selected_skills)
        
        return DependencyAnalysis(
            has_conflicts=bool(conflicts),
            missing_dependencies=missing_deps,
            conflict_details=conflicts,
            recommended_skills=recommended,
            dependency_chain=dependency_chain
        )
    
    def _check_conflicts(self, selected_skills: Set[str]) -> List[str]:
        """检查冲突"""
        conflicts = []
        
        for skill in selected_skills:
            if skill in self.conflicts:
                for conflict in self.conflicts[skill]:
                    if conflict in selected_skills:
                        conflicts.append(f"{skill} 与 {conflict} 冲突")
        
        return conflicts
    
    def _check_missing_dependencies(self, selected_skills: Set[str]) -> List[str]:
        """检查缺失的依赖"""
        missing = []
        checked = set()
        
        def check_deps(skill: str, path: List[str]):
            if skill in checked:
                return
            checked.add(skill)
            
            if skill in self.dependencies:
                for dep in self.dependencies[skill]:
                    if dep not in selected_skills:
                        missing.append(f"{skill} 需要 {dep}")
                    check_deps(dep, path + [skill])
        
        for skill in selected_skills:
            check_deps(skill, [])
        
        return missing
    
    def _get_recommendations(self, selected_skills: Set[str]) -> List[str]:
        """获取推荐技能"""
        recommendations = set()
        
        # 基于组合的推荐
        for combo_name, combo_skills in self.combinations.items():
            combo_set = set(combo_skills)
            # 如果用户选择了组合中的大部分技能
            overlap = len(selected_skills & combo_set)
            if overlap >= len(combo_set) // 2 and overlap > 0:
                # 推荐组合中的其他技能
                missing = combo_set - selected_skills
                recommendations.update(missing)
        
        # 基于依赖的推荐
        for skill in selected_skills:
            if skill in self.dependencies:
                recommendations.update(self.dependencies[skill])
        
        return list(recommendations - selected_skills)
    
    def _build_dependency_chain(self, selected_skills: List[str]) -> List[str]:
        """构建依赖链"""
        chain = []
        processed = set()
        
        def add_with_deps(skill: str):
            if skill in processed:
                return
            processed.add(skill)
            
            if skill in self.dependencies:
                for dep in self.dependencies[skill]:
                    if dep not in processed:
                        add_with_deps(dep)
            
            chain.append(skill)
        
        for skill in selected_skills:
            add_with_deps(skill)
        
        return chain
    
    def get_skill_dependencies(self, skill: str) -> List[str]:
        """获取技能的依赖"""
        return self.dependencies.get(skill, [])
    
    def get_skill_conflicts(self, skill: str) -> List[str]:
        """获取技能的冲突"""
        return self.conflicts.get(skill, [])
    
    def get_combination_skills(self, combination_name: str) -> List[str]:
        """获取组合中的技能"""
        return self.combinations.get(combination_name, [])
    
    def get_all_combinations(self) -> Dict[str, List[str]]:
        """获取所有组合"""
        return self.combinations.copy()
    
    def validate_skill_set(self, skills: List[str]) -> Tuple[bool, List[str]]:
        """
        验证技能集合
        
        Returns:
            (is_valid, error_messages)
        """
        selected_set = set(skills)
        errors = []
        
        # 检查冲突
        conflicts = self._check_conflicts(selected_set)
        if conflicts:
            errors.extend(conflicts)
        
        # 检查缺失依赖
        missing = self._check_missing_dependencies(selected_set)
        if missing:
            errors.append(f"缺失依赖: {', '.join(missing)}")
        
        return (len(errors) == 0, errors)
    
    def get_topological_order(self, skills: List[str]) -> List[str]:
        """获取拓扑排序（依赖顺序）"""
        in_degree = defaultdict(int)
        graph = defaultdict(list)
        all_skills = set(skills)
        
        # 构建图
        for skill in skills:
            if skill in self.dependencies:
                for dep in self.dependencies[skill]:
                    if dep in all_skills:
                        graph[dep].append(skill)
                        in_degree[skill] += 1
                    else:
                        all_skills.add(dep)
                        graph[dep].append(skill)
                        in_degree[skill] += 1
        
        # 初始化入度
        for skill in all_skills:
            if skill not in in_degree:
                in_degree[skill] = 0
        
        # 拓扑排序
        result = []
        queue = deque([skill for skill in all_skills if in_degree[skill] == 0])
        
        while queue:
            skill = queue.popleft()
            result.append(skill)
            
            for neighbor in graph[skill]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
        
        return result
    
    def find_related_combinations(self, skills: List[str]) -> List[Tuple[str, float]]:
        """查找相关组合"""
        skill_set = set(skills)
        related = []
        
        for combo_name, combo_skills in self.combinations.items():
            combo_set = set(combo_skills)
            
            # 计算重合度
            overlap = len(skill_set & combo_set)
            if overlap > 0:
                # 计算相似度分数
                similarity = overlap / len(skill_set | combo_set)
                related.append((combo_name, similarity))
        
        # 按相似度排序
        related.sort(key=lambda x: x[1], reverse=True)
        
        return related

class SkillRanker:
    """技能排序器"""
    
    def __init__(self, dependency_graph: SkillDependencyGraph):
        self.dependency_graph = dependency_graph
    
    def rank_skills(self, skills: List[Dict[str, Any]], 
                   context: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        对技能进行排序
        
        Args:
            skills: 技能列表
            context: 上下文信息
            
        Returns:
            排序后的技能列表
        """
        
        def calculate_rank_score(skill: Dict[str, Any]) -> float:
            """计算排序分数"""
            score = 0.0
            skill_name = skill.get('name', '')
            
            # 基础分数
            score += skill.get('score', 0.0)
            
            # 依赖分析加分
            if context and 'selected_skills' in context:
                selected_skills = context['selected_skills']
                analysis = self.dependency_graph.analyze_dependencies(selected_skills)
                
                # 依赖技能优先
                if skill_name in analysis.missing_dependencies:
                    score += 0.3
                
                # 推荐技能优先
                if skill_name in analysis.recommended_skills:
                    score += 0.2
            
            # 技术栈匹配加分
            if context and 'technical_stack' in context:
                tech_stack = context['technical_stack']
                if any(tech in skill.get('tech_stack', []) for tech in tech_stack):
                    score += 0.15
            
            # 需求匹配加分
            if context and 'requirements' in context:
                requirements = context['requirements']
                for req in requirements:
                    if req.lower() in skill.get('description', '').lower():
                        score += 0.1
            
            # 核心技能优先
            if self._is_core_skill(skill_name):
                score += 0.1
            
            return score
        
        # 计算每个技能的分数
        for skill in skills:
            skill['rank_score'] = calculate_rank_score(skill)
        
        # 按分数排序
        skills.sort(key=lambda x: x['rank_score'], reverse=True)
        
        # 更新排名
        for i, skill in enumerate(skills):
            skill['rank'] = i + 1
            if not skill.get('reason'):
                skill['reason'] = f"综合评分: {skill['rank_score']:.3f}"
        
        return skills
    
    def _is_core_skill(self, skill_name: str) -> bool:
        """判断是否为核心技能"""
        core_patterns = ['core', 'base', 'fundamental', 'basic']
        return any(pattern in skill_name.lower() for pattern in core_patterns)