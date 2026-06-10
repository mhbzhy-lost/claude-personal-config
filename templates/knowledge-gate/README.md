# Vendored Knowledge Gate

本模板用于把“哪些路径变更必须同步维护知识库”的判断复制到目标项目内。
目标项目运行时不依赖 `claude-config`。

## 安装

```bash
bash /path/to/claude-config/scripts/install-knowledge-gate.sh /path/to/project
```

安装器会复制以下文件，若目标项目已有同名文件则保留现有文件：

- `.agent/hooks/knowledge-gate.py`
- `.agent/knowledge-gate.json`
- `.githooks/pre-commit`

如需启用 Git hook：

```bash
git -C /path/to/project config core.hooksPath .githooks
```

## 规则

编辑目标项目内 `.agent/knowledge-gate.json`：

```json
{
  "version": 1,
  "rules": [
    {
      "id": "agent-runtime",
      "paths": ["init_*.sh", "shared/policies/**"],
      "satisfy_by": ["docs/knowledge/**"],
      "reason": "这些路径通常改变 agent 运行时、初始化流程或配置契约"
    }
  ]
}
```

`paths` 命中 staged diff 时，必须同时 stage 至少一个 `satisfy_by` 命中的文件。
如果项目没有 `.agent/knowledge-gate.json`，checker 直接 no-op。
如果配置文件存在但不是合法 JSON，或 checker 无法读取 staged diff，会返回 `2`
阻断提交。

匹配使用 Python `fnmatch.fnmatchcase`。其中 `*` 会匹配 `/`，不是 shell glob
里“只匹配单级目录”的语义；需要严格目录层级时，请在目标项目的 checker 副本中扩展
匹配逻辑。

## 粒度

- any：`satisfy_by: ["docs/knowledge/**"]`，任意知识文档更新即可满足。
- topic：`satisfy_by: ["docs/knowledge/runtime.md"]`，必须更新指定主题文档。

默认不提供“一源文件一文档”的强映射。需要这种约束的项目应在自己的 checker 副本上扩展。
