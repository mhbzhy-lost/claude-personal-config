"""
文件引用分析器

分析文件内容，提取技术栈、项目结构、代码模式和需求信息
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Set, Optional, Any
from dataclasses import dataclass, field

@dataclass
class FileContext:
    """文件上下文数据结构"""
    mentioned_files: List[Dict[str, Any]] = field(default_factory=list)
    project_structure: Dict[str, Any] = field(default_factory=dict)
    technical_stack: Set[str] = field(default_factory=set)
    code_patterns: List[str] = field(default_factory=list)
    requirements: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)

@dataclass
class TechnicalInfo:
    """技术信息数据结构"""
    frameworks: Set[str] = field(default_factory=set)
    languages: Set[str] = field(default_factory=set)
    databases: Set[str] = field(default_factory=set)
    tools: Set[str] = field(default_factory=set)
    libraries: Set[str] = field(default_factory=set)

class FileReferenceAnalyzer:
    """文件引用分析器"""
    
    def __init__(self):
        # 技术关键词库
        self.tech_keywords = {
            # 框架
            'react': {'framework': True, 'category': 'frontend'},
            'vue': {'framework': True, 'category': 'frontend'},
            'angular': {'framework': True, 'category': 'frontend'},
            'django': {'framework': True, 'category': 'backend'},
            'flask': {'framework': True, 'category': 'backend'},
            'fastapi': {'framework': True, 'category': 'backend'},
            'spring': {'framework': True, 'category': 'backend'},
            'express': {'framework': True, 'category': 'backend'},
            'next.js': {'framework': True, 'category': 'fullstack'},
            'nuxt.js': {'framework': True, 'category': 'fullstack'},
            
            # 数据库
            'postgresql': {'database': True, 'category': 'database'},
            'mysql': {'database': True, 'category': 'database'},
            'mongodb': {'database': True, 'category': 'database'},
            'redis': {'database': True, 'category': 'cache'},
            'elasticsearch': {'database': True, 'category': 'search'},
            'sqlite': {'database': True, 'category': 'database'},
            
            # 云服务
            'aws': {'cloud': True, 'category': 'cloud'},
            'gcp': {'cloud': True, 'category': 'cloud'},
            'azure': {'cloud': True, 'category': 'cloud'},
            'docker': {'container': True, 'category': 'devops'},
            'kubernetes': {'container': True, 'category': 'devops'},
            'kafka': {'messaging': True, 'category': 'middleware'},
            
            # 编程语言
            'python': {'language': True, 'category': 'backend'},
            'javascript': {'language': True, 'category': 'frontend'},
            'typescript': {'language': True, 'category': 'frontend'},
            'java': {'language': True, 'category': 'backend'},
            'go': {'language': True, 'category': 'backend'},
            'rust': {'language': True, 'category': 'backend'},
            'c++': {'language': True, 'category': 'system'},
            
            # 构建工具
            'npm': {'tool': True, 'category': 'build'},
            'yarn': {'tool': True, 'category': 'build'},
            'webpack': {'tool': True, 'category': 'build'},
            'vite': {'tool': True, 'category': 'build'},
            'cmake': {'tool': True, 'category': 'build'},
            'make': {'tool': True, 'category': 'build'},
            
            # 测试工具
            'pytest': {'tool': True, 'category': 'test'},
            'jest': {'tool': True, 'category': 'test'},
            'mocha': {'tool': True, 'category': 'test'},
            'cypress': {'tool': True, 'category': 'test'},
            'selenium': {'tool': True, 'category': 'test'},
        }
        
        # 项目结构模式
        self.project_patterns = {
            'package.json': {'type': 'config', 'purpose': 'dependencies'},
            'pom.xml': {'type': 'config', 'purpose': 'maven'},
            'requirements.txt': {'type': 'config', 'purpose': 'python'},
            'pyproject.toml': {'type': 'config', 'purpose': 'python'},
            'go.mod': {'type': 'config', 'purpose': 'go'},
            'Cargo.toml': {'type': 'config', 'purpose': 'rust'},
            'tsconfig.json': {'type': 'config', 'purpose': 'typescript'},
            'webpack.config.js': {'type': 'config', 'purpose': 'webpack'},
            'dockerfile': {'type': 'config', 'purpose': 'docker'},
            'docker-compose.yml': {'type': 'config', 'purpose': 'docker'},
            'gitignore': {'type': 'config', 'purpose': 'git'},
            'license': {'type': 'config', 'purpose': 'legal'},
        }
    
    def analyze_files(self, file_references: List[Dict[str, Any]]) -> FileContext:
        """
        分析文件引用
        
        Args:
            file_references: 文件引用列表
            
        Returns:
            FileContext: 文件分析结果
        """
        analysis = FileContext()
        
        for ref in file_references:
            file_path = ref.get("file_path", "")
            content = ref.get("content", "")
            file_type = ref.get("file_type", "unknown")
            purpose = ref.get("purpose", "reference")
            
            # 添加到已提及文件列表
            analysis.mentioned_files.append({
                "path": file_path,
                "type": file_type,
                "purpose": purpose,
                "key_points": self._extract_key_points(content, file_type)
            })
            
            # 分析技术栈
            tech_stack = self._detect_tech_stack(content)
            analysis.technical_stack.update(tech_stack)
            
            # 分析项目结构
            structure = self._analyze_project_structure(file_path, content)
            analysis.project_structure.update(structure)
            
            # 提取代码模式
            patterns = self._extract_code_patterns(content, file_type)
            analysis.code_patterns.extend(patterns)
            
            # 提取需求信息
            requirements = self._extract_requirements(content)
            analysis.requirements.extend(requirements)
            
            # 提取依赖信息
            dependencies = self._extract_dependencies(content)
            analysis.dependencies.extend(dependencies)
        
        return analysis
    
    def _detect_tech_stack(self, content: str) -> Set[str]:
        """检测技术栈"""
        tech_found = set()
        content_lower = content.lower()
        
        # 检查每个技术关键词
        for tech, info in self.tech_keywords.items():
            if tech in content_lower:
                tech_found.add(tech)
        
        # 特殊模式检测
        patterns = {
            r'react\s*\d*\.\d*\.\d*': 'react',
            r'vue\s*\d*\.\d*\.\d*': 'vue',
            r'angular\s*\d*\.\d*\.\d*': 'angular',
            r'django\s*\d*\.\d*\.\d*': 'django',
            r'flask\s*\d*\.\d*\.\d*': 'flask',
            r'fastapi\s*\d*\.\d*\.\d*': 'fastapi',
        }
        
        for pattern, tech in patterns.items():
            if re.search(pattern, content_lower):
                tech_found.add(tech)
        
        return tech_found
    
    def _analyze_project_structure(self, file_path: str, content: str) -> Dict[str, Any]:
        """分析项目结构"""
        structure = {}
        
        # 基于文件路径确定项目结构
        path_parts = Path(file_path).parts
        
        # 识别常见项目根目录
        if 'package.json' in file_path:
            structure['project_root'] = True
            structure['project_type'] = 'node'
        elif 'pom.xml' in file_path:
            structure['project_root'] = True
            structure['project_type'] = 'maven'
        elif 'requirements.txt' in file_path or 'pyproject.toml' in file_path:
            structure['project_root'] = True
            structure['project_type'] = 'python'
        
        # 提取目录结构
        if len(path_parts) > 1:
            structure['directories'] = list(path_parts[:-1])
        
        return structure
    
    def _extract_code_patterns(self, content: str, file_type: str) -> List[str]:
        """提取代码模式"""
        patterns = []
        
        # 基于文件类型的模式
        if file_type == 'python':
            # 类定义模式
            class_patterns = re.findall(r'class\s+(\w+)', content)
            patterns.extend([f"class:{cls}" for cls in class_patterns])
            
            # 函数定义模式
            func_patterns = re.findall(r'def\s+(\w+)\s*\(', content)
            patterns.extend([f"function:{func}" for func in func_patterns])
            
        elif file_type == 'javascript':
            # 组件定义模式
            component_patterns = re.findall(r'function\s+(\w+)|const\s+(\w+)\s*=', content)
            patterns.extend([f"component:{comp[0] or comp[1]}" for comp in component_patterns])
            
        elif file_type == 'json':
            # 配置模式
            try:
                data = json.loads(content)
                if 'dependencies' in data:
                    patterns.append("has-dependencies")
                if 'scripts' in data:
                    patterns.append("has-scripts")
            except:
                pass
        
        # 通用模式
        if 'import' in content.lower():
            patterns.append("has-imports")
        if 'require' in content.lower():
            patterns.append("has-requires")
        if 'export' in content.lower():
            patterns.append("has-exports")
        
        return patterns
    
    def _extract_requirements(self, content: str) -> List[str]:
        """提取需求信息"""
        requirements = []
        content_lower = content.lower()
        
        # 基于关键词的需求提取
        requirement_keywords = [
            '需要', 'require', '需要实现', 'implement', '功能', 'feature',
            '目标', 'goal', '要求', 'specification', '必须', 'must',
            '应该', 'should', '期望', 'expect', '打算', 'plan'
        ]
        
        for keyword in requirement_keywords:
            if keyword in content_lower:
                # 提取包含关键词的句子
                sentences = re.findall(rf'[^.!?]*{keyword}[^.!?]*[.!?]', content)
                requirements.extend([s.strip() for s in sentences])
        
        return requirements
    
    def _identify_file_type(self, filename: str, content: str = None) -> str:
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
        }
        return type_mapping.get(ext, 'unknown')

    def _extract_dependencies(self, content: str) -> List[str]:
        """提取依赖信息"""
        dependencies = []

        # 尝试作为JSON解析（package.json 内容）
        try:
            data = json.loads(content)
            if isinstance(data, dict):
                if 'dependencies' in data:
                    for dep, version in data['dependencies'].items():
                        dependencies.append(f"{dep}@{version}")
                if 'devDependencies' in data:
                    for dep, version in data['devDependencies'].items():
                        dependencies.append(f"dev:{dep}@{version}")
                if dependencies:
                    return dependencies
        except (json.JSONDecodeError, TypeError):
            pass

        # 纯 requirements.txt 内容（无文件名标记）
        lines = content.strip().split('\n')
        if lines and any('==' in line or '>=' in line or '<=' in line for line in lines):
            for line in lines:
                line = line.strip()
                if line and not line.startswith('#'):
                    dependencies.append(line)
            if dependencies:
                return dependencies

        # JSON依赖提取（原始逻辑，当内容包含文件名标记时）
        if 'package.json' in content:
            try:
                data = json.loads(content)
                if 'dependencies' in data:
                    for dep, version in data['dependencies'].items():
                        dependencies.append(f"{dep}@{version}")
                if 'devDependencies' in data:
                    for dep, version in data['devDependencies'].items():
                        dependencies.append(f"dev:{dep}@{version}")
            except:
                pass
        
        # Python依赖提取
        elif 'requirements.txt' in content:
            lines = content.split('\n')
            for line in lines:
                line = line.strip()
                if line and not line.startswith('#'):
                    dependencies.append(line)
        
        # Go依赖提取
        elif 'go.mod' in content:
            # 简单的go mod依赖提取
            require_pattern = r'require\s+([^\s]+)\s+([^\s]+)'
            matches = re.findall(require_pattern, content)
            for module, version in matches:
                dependencies.append(f"{module} {version}")
        
        return dependencies
    
    def _extract_key_points(self, content: str, file_type: str) -> List[str]:
        """提取关键点"""
        key_points = []
        
        if not content:
            return key_points
        
        # 基于文件类型的特定提取
        if file_type == 'markdown':
            # 提取标题
            headers = re.findall(r'^#\s+(.+)$', content, re.MULTILINE)
            key_points.extend([f"section:{header}" for header in headers])
            
        elif file_type == 'json':
            # 提取顶层键
            try:
                data = json.loads(content)
                for key in data.keys():
                    key_points.append(f"config:{key}")
            except:
                pass
        
        elif file_type in ['python', 'javascript', 'typescript']:
            # 提取类名和函数名
            classes = re.findall(r'class\s+(\w+)', content)
            functions = re.findall(r'def\s+(\w+)|function\s+(\w+)', content)
            key_points.extend([f"class:{cls}" for cls in classes])
            key_points.extend([f"function:{func[0] or func[1]}" for func in functions])
        
        # 通用提取
        if len(content) > 100:  # 长文件
            key_points.append("long-file")
        if len(content.split('\n')) > 50:  # 多行文件
            key_points.append("multi-line")
        
        return key_points
    
    def get_technical_info(self, file_context: FileContext) -> TechnicalInfo:
        """获取技术信息摘要"""
        tech_info = TechnicalInfo()
        
        for tech in file_context.technical_stack:
            info = self.tech_keywords.get(tech, {})
            
            if info.get('framework'):
                tech_info.frameworks.add(tech)
            elif info.get('database'):
                tech_info.databases.add(tech)
            elif info.get('language'):
                tech_info.languages.add(tech)
            elif info.get('tool'):
                tech_info.tools.add(tech)
            elif info.get('container'):
                tech_info.tools.add(tech)
            else:
                tech_info.libraries.add(tech)
        
        return tech_info