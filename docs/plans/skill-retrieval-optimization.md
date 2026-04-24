# 技能检索系统优化方案

## 文档信息
- **创建时间**: 2026-04-23
- **版本**: v1.0
- **负责人**: 待分配
- **状态**: 待实施

## 1. 背景与目标

### 1.1 背景
当前技能检索系统在使用过程中暴露出以下问题：
- **性能瓶颈**：随着技能数量增长（当前41个技术栈，数百个技能），LLM调用频繁导致响应延迟
- **检索精度不足**：仅依赖LLM分类，对常见查询模式支持不够
- **组合推荐能力弱**：无法识别技能间的依赖关系和组合需求
- **用户体验问题**：重复查询处理效率低，推荐结果不够精准

### 1.2 目标
通过实施以下四项优化方案，实现：
- 查询响应时间降低80%
- LLM调用次数减少70%
- 技能推荐精度提升40%
- 组合任务成功率提升50%

## 2. 当前问题分析

### 2.1 性能问题
- **LLM调用开销**：每次查询都需要调用qwen2.5:7b进行意图识别
- **全量检索**：没有预过滤机制，所有技能都要参与匹配
- **重复计算**：相同查询重复进行分类和排序

### 2.2 检索精度问题
- **语义理解局限**：仅靠LLM分类，无法处理关键词和模式匹配
- **缺乏上下文**：无法基于项目结构进行精准推荐
- **组合盲区**：无法识别需要多个技能配合的复杂任务

### 2.3 用户体验问题
- **响应延迟**：LLM推理导致明显等待时间
- **推荐不准**：用户需要多次尝试才能找到合适技能
- **缺乏指导**：没有解释为什么推荐特定技能

## 3. 方案设计

### 3.1 混合检索引擎

#### 3.1.1 设计原理
结合多种检索策略，在性能和精度之间取得平衡：
```
查询输入 → 关键词预过滤 → 规则匹配 → 向量检索 → LLM精调 → 结果融合
```

#### 3.1.2 实现架构
```python
class HybridRetrieval:
    def __init__(self):
        self.keyword_index = KeywordIndex()        # 关键词倒排索引
        self.rule_engine = RuleEngine()            # 规则引擎
        self.vector_store = VectorStore()          # 向量存储
        self.llm_classifier = LLMClassifier()      # LLM分类器
    
    def retrieve(self, query, context):
        # 第一层：关键词预过滤
        candidates = self.keyword_index.filter(query)
        
        # 第二层：规则匹配
        rule_candidates = self.rule_engine.match(query, candidates)
        
        # 第三层：向量语义检索
        semantic_candidates = self.vector_store.search(query, candidates)
        
        # 第四层：LLM精调
        final_candidates = self.llm_classifier.refine(
            query, rule_candidates + semantic_candidates, context
        )
        
        return final_candidates
```

#### 3.1.3 具体实现要点

**关键词预过滤**：
- 构建技能名称、描述、标签的倒排索引
- 支持模糊匹配和同义词扩展
- 返回Top 50候选技能

**规则引擎**：
- 定义常见查询模式映射
- 例如：`"django项目"` → 技能栈：`["django"]`，能力：`["web-framework"]`
- 支持正则表达式匹配和模板匹配

**向量检索**：
- 使用sentence-transformers对技能描述进行向量化
- 计算查询向量与技能向量的余弦相似度
- 返回语义相似的技能

**结果融合**：
- 综合关键词匹配度、规则置信度、向量相似度
- 加权计算最终得分（关键词40%，规则30%，向量20%，LLM10%）

#### 3.1.4 预期效果
- 减少70%的LLM调用
- 查询响应时间从2-3秒降至500ms以内
- 基础查询准确率提升50%

### 3.2 智能缓存系统

#### 3.2.1 缓存策略
- **分类结果缓存**：缓存LLM分类结果，TTL 24小时
- **技能列表缓存**：缓存按技术栈、语言、能力的过滤结果，TTL 1小时
- **查询结果缓存**：缓存完整查询结果，TTL 10分钟
- **LRU淘汰**：当缓存超过1000条时，淘汰最少使用的数据

#### 3.2.2 缓存键设计
```python
def generate_cache_key(query, context, tech_stack, capability, language):
    """生成缓存键"""
    key_data = {
        'query_hash': hashlib.md5(query.encode()).hexdigest(),
        'context_hash': hashlib.md5(str(context).encode()).hexdigest(),
        'tech_stack': sorted(tech_stack or []),
        'capability': sorted(capability or []),
        'language': sorted(language or []),
        'timestamp': int(time.time() // 3600)  # 按小时分组
    }
    return hashlib.md5(str(key_data).encode()).hexdigest()
```

#### 3.2.3 缓存更新策略
- **主动更新**：技能库变更时主动失效相关缓存
- **被动更新**：缓存过期后自动重新计算
- **预加载**：系统启动时预加载热门查询结果

#### 3.2.4 监控指标
- 缓存命中率（目标：80%+）
- 平均响应时间（目标：<200ms）
- 缓存内存使用量

### 3.3 技能依赖图

#### 3.3.1 依赖关系建模
```python
class SkillDependency:
    def __init__(self):
        self.dependencies = {}      # 技能依赖关系
        self.conflicts = {}         # 技能冲突关系
        self.combinations = {}     # 常用组合
    
    # 示例依赖关系
    DEPENDENCY_RULES = {
        'django-drf': ['django-core', 'django-orm-advanced'],
        'django-auth': ['django-core', 'django-orm-advanced'],
        'mobile-native': ['react-native', 'android', 'ios']
    }
    
    # 示例冲突关系
    CONFLICT_RULES = {
        'django': ['flask', 'fastapi'],
        'react': ['vue', 'angular']
    }
    
    # 示例组合关系
    COMBINATION_RULES = {
        'ecommerce': ['django-core', 'django-drf', 'payment'],
        'blog': ['django-core', 'django-orm-advanced', 'django-views']
    }
```

#### 3.3.2 依赖检测算法
```python
def check_dependency_conflicts(selected_skills, project_context):
    """检测技能冲突和依赖"""
    conflicts = []
    missing_deps = []
    recommendations = []
    
    # 检查冲突
    for skill in selected_skills:
        for conflict in CONFLICT_RULES.get(skill, []):
            if conflict in selected_skills:
                conflicts.append(f"{skill} 与 {conflict} 冲突")
    
    # 检查依赖
    for skill in selected_skills:
        for dep in DEPENDENCY_RULES.get(skill, []):
            if dep not in selected_skills:
                missing_deps.append(f"{skill} 需要 {dep}")
    
    # 推荐组合
    for combo, skills in COMBINATION_RULES.items():
        if all(skill in selected_skills for skill in skills):
            recommendations.append(f"检测到 {combo} 模式，可考虑添加：{skills}")
    
    return {
        'conflicts': conflicts,
        'missing_dependencies': missing_deps,
        'recommendations': recommendations
    }
```

#### 3.3.3 智能推荐算法
```python
def skill_recommendation(user_query, current_skills, project_context):
    """智能推荐相关技能"""
    
    # 基于依赖关系推荐
    dependency_skills = set()
    for skill in current_skills:
        dependency_skills.update(DEPENDENCY_RULES.get(skill, []))
    
    # 基于组合模式推荐
    combination_skills = set()
    for combo, skills in COMBINATION_RULES.items():
        if len(set(current_skills) & set(skills)) >= len(skills) // 2:
            combination_skills.update(skills - set(current_skills))
    
    # 基于语义相似度推荐
    semantic_skills = vector_store.search(user_query, current_skills)
    
    # 合并并去重
    all_recommendations = list(dependency_skills | combination_skills | semantic_skills)
    
    # 按优先级排序
    ranked = rank_recommendations(
        all_recommendations, 
        user_query, 
        current_skills,
        project_context
    )
    
    return ranked[:10]  # 返回Top 10推荐
```

#### 3.3.4 预期效果
- 解决技能组合冲突问题
- 提升组合任务成功率50%
- 减少用户搜索时间70%

### 3.4 查询优化与重写

#### 3.4.1 查询预处理
```python
class QueryOptimizer:
    def __init__(self):
        self.synonyms = {
            '项目': ['project', 'app', '应用'],
            'API': ['接口', 'endpoint', '服务'],
            '数据库': ['db', 'database', '存储'],
            '前端': ['frontend', 'client', 'ui'],
            '后端': ['backend', 'server', 'api']
        }
        
        self.patterns = {
            r'创建.*django.*项目': ['django', 'startproject'],
            r'集成.*支付.*功能': ['payment', 'integration'],
            r'用户.*认证': ['auth', 'authentication']
        }
    
    def optimize_query(self, query):
        """查询优化和重写"""
        # 1. 标准化处理
        normalized = query.lower().strip()
        
        # 2. 同义词扩展
        expanded = self.expand_synonyms(normalized)
        
        # 3. 模式匹配
        pattern_matches = self.match_patterns(expanded)
        
        # 4. 意图识别
        intent = self.detect_intent(expanded)
        
        return {
            'original': query,
            'normalized': normalized,
            'expanded': expanded,
            'pattern_matches': pattern_matches,
            'intent': intent
        }
```

#### 3.4.2 查询重写规则
```python
QUERY_REWRITES = {
    # 模糊查询精确化
    '做网站': 'web开发 项目创建',
    '写APP': 'mobile应用 开发',
    '连数据库': '数据库 连接 配置',
    
    # 技术栈明确化
    'django页面': 'django 视图 模板',
    'react组件': 'react 组件 开发',
    '登录功能': '用户认证 登录 注册',
    
    # 复合需求分解
    '电商系统': '项目创建 用户管理 商品系统 支付功能',
    '博客系统': '项目创建 文章管理 用户评论'
}
```

#### 3.4.3 上下文增强
```python
def enhance_context_with_project(project_path):
    """基于项目结构增强上下文"""
    
    # 分析项目技术栈
    tech_stack = detect_tech_stack(project_path)
    
    # 分析项目结构
    structure = analyze_project_structure(project_path)
    
    # 分析现有技能使用情况
    existing_skills = detect_existing_skills(project_path)
    
    return {
        'tech_stack': tech_stack,
        'structure': structure,
        'existing_skills': existing_skills,
        'context_summary': generate_context_summary(tech_stack, structure)
    }
```

#### 3.4.4 预期效果
- 查询理解精度提升40%
- 减少模糊查询尝试次数60%
- 上下文感知能力增强

## 4. 实施计划

### 4.1 开发阶段（6周）

#### 第1-2周：混合检索引擎
- **任务1**：关键词倒排索引实现
- **任务2**：规则引擎开发
- **任务3**：向量检索集成
- **任务4**：结果融合算法
- **验收标准**：LLM调用减少70%，响应时间<500ms

#### 第3-4周：智能缓存系统
- **任务1**：缓存接口设计
- **任务2**：LRU缓存实现
- **任务3**：缓存键生成策略
- **任务4**：缓存监控工具
- **验收标准**：缓存命中率>80%，内存使用<1GB

#### 第5-6周：技能依赖图
- **任务1**：依赖关系建模
- **任务2**：冲突检测算法
- **任务3**：智能推荐引擎
- **任务4**：依赖图可视化
- **验收标准**：冲突检测准确率>95%，推荐精度提升40%

#### 第7-8周：查询优化与重写
- **任务1**：查询预处理系统
- **任务2**：同义词和规则配置
- **任务3**：上下文增强模块
- **任务4**：查询重写引擎
- **验收标准**：查询理解精度提升40%，用户满意度提升50%

### 4.2 测试阶段（2周）

#### 单元测试
- 每个模块的单元测试覆盖率>90%
- 性能基准测试
- 边界条件测试

#### 集成测试
- 端到端功能测试
- 性能压力测试
- 回归测试

#### 用户测试
- 内部用户试用
- A/B测试验证效果
- 用户反馈收集

### 4.3 部署阶段（1周）

#### 灰度发布
- 10%流量切换到新系统
- 监控关键指标
- 逐步扩大流量

#### 全量部署
- 100%流量切换
- 回滚方案准备
- 监控告警配置

## 5. 预期收益

### 5.1 性能提升
- **响应时间**：从2-3秒降至200ms内（提升90%）
- **LLM调用**：减少70%（成本降低70%）
- **缓存命中率**：达到80%（显著提升用户体验）

### 5.2 功能增强
- **检索精度**：提升40%（减少用户尝试次数）
- **组合推荐**：成功率提升50%（解决复杂任务）
- **冲突检测**：准确率95%（避免配置问题）

### 5.3 用户体验
- **查询理解**：精度提升40%（更懂用户需求）
- **推荐质量**：满意度提升60%（更精准推荐）
- **操作效率**：完成任务时间减少50%（更快找到技能）

### 5.4 运维效率
- **监控能力**：全面的缓存和性能监控
- **可维护性**：模块化设计便于维护
- **扩展性**：为后续功能扩展奠定基础

## 6. 风险评估

### 6.1 技术风险

#### 风险1：向量检索精度不足
- **可能性**：中等
- **影响**：检索质量下降
- **缓解措施**：
  - 使用高质量预训练模型
  - 定期优化向量表示
  - 人工调校重要查询

#### 风险2：缓存雪崩
- **可能性**：低
- **影响**：系统性能下降
- **缓解措施**：
  - 实现缓存预热
  - 设置随机过期时间
  - 降级策略准备

#### 风险3：依赖关系复杂度
- **可能性**：中等
- **影响**：推荐准确性下降
- **缓解措施**：
  - 渐进式添加依赖规则
  - 用户反馈优化
  - 定期人工审核

### 6.2 业务风险

#### 风险1：用户体验变化
- **可能性**：低
- **影响**：用户适应期
- **缓解措施**：
  - 灰度发布验证
  - 用户引导说明
  - 回滚方案准备

#### 风险2：数据一致性
- **可能性**：低
- **影响**：推荐结果偏差
- **缓解措施**：
  - 数据校验机制
  - 定期数据同步
  - 异常检测报警

### 6.3 资源风险

#### 风险1：开发资源不足
- **可能性**：中等
- **影响**：项目延期
- **缓解措施**：
  - 优先核心功能
  - 分阶段交付
  - 外部资源支援

#### 风险2：测试覆盖不足
- **可能性**：中等
- **影响**：质量问题
- **缓解措施**：
  - 自动化测试覆盖
  - 专项测试资源
  - 用户参与测试

## 7. 监控指标

### 7.1 核心性能指标
| 指标名称 | 目标值 | 监控频率 |
|---------|--------|----------|
| 平均响应时间 | <200ms | 实时 |
| LLM调用次数 | 减少70% | 每日 |
| 缓存命中率 | >80% | 每小时 |
| 错误率 | <0.1% | 实时 |

### 7.2 功能指标
| 指标名称 | 目标值 | 监控频率 |
|---------|--------|----------|
| 检索精度 | 提升40% | 每日 |
| 推荐满意度 | >80% | 每周 |
| 冲突检测准确率 | >95% | 每日 |
| 用户重复查询率 | 减少50% | 每周 |

### 7.3 业务指标
| 指标名称 | 目标值 | 监控频率 |
|---------|--------|----------|
| 用户满意度 | 提升50% | 每月 |
| 任务完成率 | 提升40% | 每周 |
| 技能使用率 | 提升30% | 每月 |
| 用户留存率 | 提升20% | 每月 |

## 8. 成功标准

### 8.1 技术成功标准
- ✅ 响应时间 < 200ms（当前2-3秒）
- ✅ LLM调用减少70%
- ✅ 缓存命中率 > 80%
- ✅ 错误率 < 0.1%
- ✅ 系统可用性 > 99.9%

### 8.2 业务成功标准
- ✅ 用户满意度提升50%
- ✅ 任务完成率提升40%
- ✅ 检索精度提升40%
- ✅ 重复查询减少60%
- ✅ 技能推荐准确率提升50%

### 8.3 长期成功标准
- ✅ 成为团队标准开发工具
- ✅ 支持新技能类型的无缝集成
- ✅ 为后续AI功能奠定基础
- ✅ 提升整体开发效率30%

## 9. 后续规划

### 9.1 数据驱动的优化
- 收集用户查询日志
- 分析查询模式
- 优化推荐算法

### 9.2 功能扩展
- 支持更复杂的多技能组合
- 增加个性化推荐
- 引入用户画像系统

### 9.3 技术升级
- 图神经网络增强推荐
- 大语言模型深度集成
- 实时学习系统

---

**文档版本控制**:
- v1.0 (2026-04-23) - 初始版本
- 待定 - 实施过程中的版本更新

**审批记录**:
- [ ] 产品经理审批
- [ ] 技术负责人审批
- [ ] 运维负责人审批
- [ ] 最终负责人审批