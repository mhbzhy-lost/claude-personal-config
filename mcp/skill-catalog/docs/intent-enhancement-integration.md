# Intent Enhancement 集成说明

本 MCP server 支持通过 `intent-enhancement` 模块的增强意图识别 + 混合检索替换默认的 classifier + rank 流程。**默认关闭**，不设置开关时行为与集成前完全一致。

## 启用

1. 安装 intent-enhancement 依赖（在仓库根目录）：

   ```bash
   pip install -r intent-enhancement/requirements.txt
   ```

2. 启动 MCP server 时设置环境变量：

   ```bash
   ENABLE_INTENT_ENHANCEMENT=true
   ```

   可接受值：`true` / `1` / `yes`（大小写不敏感）。其他值（含未设置）= 关闭。

## 路径解析

`pipeline.py` 通过 `__file__` 相对定位仓库根 `<repo>/intent-enhancement/src`，并在增强路径首次触发时动态注入 `sys.path`。无需 `pip install -e` 或额外环境变量。

## 返回值差异

增强路径的返回 dict 是传统 pipeline 的超集：
- 原字段 `cwd` / `fingerprint` / `tech_stack` / `capability` / `classifier_error` / `skills` 保留，`skills` 仍为 `[{name, description}]` 列表
- 新增字段：`intent_enhancement_used=True` / `enhanced_intent` / `original_intent` / `intent_confidence` / `confidence` / `technical_context` / `dependency_analysis` / `processing_time` / `used_cache` / `enhanced_skills`（含完整 tech_stack/language/capability 等字段的技能列表）

## 降级策略

以下任一情形会自动 fall back 到传统 pipeline 并 WARNING 日志：

- `intent-enhancement/src` 目录不存在
- `intent_enhancement`/`retrieval`/`utils` 依赖 import 失败（如 `pyyaml` 未装）
- `EnhancedSkillResolver.resolve()` 抛出任何异常

降级后返回值完全等同于关闭开关时的结果；MCP 客户端无需感知。

## 日志示例

```
WARNING skill_catalog.pipeline: Intent enhancement failed, falling back to legacy pipeline: No module named 'yaml'
```
