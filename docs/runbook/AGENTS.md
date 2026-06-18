# Runbook 索引

本目录存放面向 agent 的操作手册（runbook）。每个 runbook 描述"如何做某件事"的
具体步骤，区别于 `docs/knowledge/` 中对"代码做了什么"的描述性知识。

## 现有 Runbook

| 文件 | 操作场景 |
|---|---|
| `opencode-dynamic-workflow-rollback.md` | （已删除，后续需要时从 git 历史恢复） |
| `external-llm-review-provider.md` | 切换 / 新增外部 LLM review provider |
| `plan-tracker-config.md` | 配置 plan 文件格式、理解 git push 拦截、修复常见失败 |
| `permission-sync.md` | 修改 permission.json 后同步到 opencode 并重启生效 |

## 相关 runbook（仍在 docs/knowledge/ 中）

以下知识文档包含排查步骤，适合遇到对应问题时直接查阅：

| 知识文档 | 排查场景 |
|---|---|
| `docs/knowledge/permission-model.md` | "命令被拦截"、"路径被拒绝" |
| `docs/knowledge/workspace-boundary.md` | agent 访问外部路径的场景分类 |
| `docs/knowledge/git-commit-gate.md` | commit message 校验规则、逃逸机制 |
| `docs/knowledge/codex-hooks-management.md` | hooks.json 与模板不一致 |

## 编写规范

- 标题以动词开头（"新增"、"排查"、"部署"）
- 每个 runbook 聚焦一个具体操作，不要合并多个场景
- 包含：前提条件、操作步骤、验证方式、常见失败处理
- 引用具体文件路径和命令，不写"请参考相关文档"这类模糊指引
