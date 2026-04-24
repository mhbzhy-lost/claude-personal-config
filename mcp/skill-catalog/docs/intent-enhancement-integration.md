# Intent Enhancement 集成说明

本 MCP server 支持通过 `intent-enhancement` 模块的增强意图识别 + 混合检索替换默认的 classifier + rank 流程。

## 默认行为

仓库根 `init_claude.sh` 执行时会：

1. 用 `uv pip install -e intent-enhancement/` 把子项目（`intent-enhancement/pyproject.toml` 声明 `pyyaml>=6`）同步到 `mcp/skill-catalog/.venv`。两个子项目各自声明依赖，uv resolver 在装入同一 venv 时自动去重
2. 通过 `claude mcp add -s user ... -e ENABLE_INTENT_ENHANCEMENT=true` 注册 MCP server 时注入开关

因此**装完即启用**，无需手动 `export` 环境变量。

## 关闭增强路径

```bash
# 1) 覆盖 init 脚本的默认值后重跑
ENABLE_INTENT_ENHANCEMENT=false bash /Users/mhbzhy/claude-config/init_claude.sh
# 2) 或直接编辑 ~/.claude.json 下 skill-catalog.env.ENABLE_INTENT_ENHANCEMENT
```

可接受的"启用"值：`true` / `1` / `yes`（大小写不敏感）。其他值（含未设置）= 关闭。

## 路径解析

`pipeline.py` 通过 `__file__` 相对定位仓库根 `<repo>/intent-enhancement/src`，并在增强路径首次触发时动态注入 `sys.path`。无需 `pip install -e` 或额外环境变量。

## 返回值差异

增强路径的返回 dict 是传统 pipeline 的超集：
- 原字段 `cwd` / `fingerprint` / `tech_stack` / `capability` / `classifier_error` / `skills` 保留，`skills` 仍为 `[{name, description}]` 列表
- 新增字段：`intent_enhancement_used=True` / `enhanced_intent` / `original_intent` / `intent_confidence` / `confidence` / `technical_context` / `dependency_analysis` / `processing_time` / `used_cache` / `enhanced_skills`（含完整 tech_stack/language/capability 等字段的技能列表）

## 降级策略

以下任一情形会自动 fall back 到传统 pipeline 并 WARNING 日志：

- `intent-enhancement/src` 目录不存在
- `intent_enhancement` / `retrieval` / `utils` 依赖 import 失败（如 `pyyaml` 未装）
- `EnhancedSkillResolver.resolve()` 抛出任何异常

降级后返回值完全等同于关闭开关时的结果；MCP 客户端无需感知。

## 日志示例

```
WARNING skill_catalog.pipeline: Intent enhancement failed, falling back to legacy pipeline: No module named 'yaml'
```
