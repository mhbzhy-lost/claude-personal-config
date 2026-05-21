# git commit hook 知识库 README 路径提示不适用于非本仓 workspace

## 现象

在任意仓库执行 `git commit` 时，PreToolUse hook 阻断提交并提示：

```text
知识文档检查：查看 staged diff，并按 `docs/knowledge/README.md` 判断是否需要更新 `docs/knowledge/`。
```

这个路径是相对当前 workspace 的写法。对于非 `claude-config` 仓库，当前
workspace 通常没有 `docs/knowledge/README.md`，或者该路径指向目标项目自己的
文档，而不是全局 hook 需要 agent 阅读的知识更新指南。

## 调用链

1. Codex / Claude / OpenCode 在 bash 工具执行前调用 git commit hint hook。
2. hook 判断命令文本命中 `git commit`，且未设置 `GIT_COMMIT_HINT_SKIP=1`。
3. Codex 与 Claude hook 读取 `opencode/plugins/git-commit-hint-content.json`。
4. OpenCode 插件同样读取 `opencode/plugins/git-commit-hint-content.json`。
5. 共享模板渲染阻断提示，模板内硬编码 `docs/knowledge/README.md`。
6. agent 按阻断提示在当前 workspace 解析相对路径，导致非本仓场景定位错误。

## 根因假设

1. 共享模板只考虑了在 `claude-config` 仓库内触发 hook 的场景，遗漏了全局安装后
   在其他 workspace 运行的场景。
2. hook 已经通过 `__CLAUDE_CONFIG_HOME__` / `CLAUDE_CONFIG_HOME` 体系知道全局配置
   仓位置，但提示文案没有使用该环境变量表达知识库 README 的实际位置。
3. 现有测试只断言包含“知识文档检查”等关键词，没有覆盖“提示必须可跨 workspace
   定位全局 README”的约束。

## 验证方式

- 单测：新增断言，要求渲染后的 git commit hint 包含
  `$CLAUDE_CONFIG_HOME/docs/knowledge/README.md`，并且不再把
  `` `docs/knowledge/README.md` `` 作为操作入口。
- 手动复现：运行 `codex/hooks/git-commit-hint.sh` 的 `git commit -m test` payload，
  检查阻断提示中的知识库 README 位置。

## 根因确认

根因是共享 git commit hint 模板把全局知识库入口硬编码为当前 workspace 相对路径，
没有通过环境变量指向 `claude-config` 的真实安装位置。

## 影响范围

- Codex hook：`codex/hooks/git-commit-hint.sh` 渲染的阻断提示。
- Claude hook：`claude/hooks/git-commit-hint.sh` 渲染的阻断提示。
- OpenCode 插件：`opencode/plugins/git-commit-hint.js` 渲染的阻断提示。
- 相关测试：`codex/hooks/tests/test_codex_hooks.py` 中对共享提示文案的断言。

## 修复方案

将共享模板中的知识库 README 操作入口改为
`$CLAUDE_CONFIG_HOME/docs/knowledge/README.md`，保留 `docs/knowledge/` 作为“目标项目
知识文档目录”的相对路径描述。

这样修复针对的是定位错误的根因：全局规则文档属于 `claude-config`，必须从全局配置
根目录解析；目标项目是否有 `docs/knowledge/` 仍由 agent 根据 staged diff 判断。
该改动只影响提示文本，不改变 hook 拦截条件、escape 条件或提交执行行为。
