# git-commit-gate 插件

Commit message 门禁，将 Conventional Commits 规范（`userconf/AGENTS.md` `Git Commit 规范` 一节）从文档升级为可执行策略。**仅插件层**：拦截 opencode bash 工具中的 `git commit` 命令，校验 message 格式。

| 文件 | 触发时机 | 作用 |
|---|---|---|
| `userconf/plugins/git-commit-gate.js` | opencode `tool.execute.before`，拦截 bash 工具中的 `git commit` 命令 | 解析命令中的 `-m`/`--message`/`$'...'`，校验 message |

> **已废弃** `.githooks/commit-msg` 层：之前作为 git 钩子兜底，实测发现
> 对 opencode 调度场景无增量价值且引入路径管理成本，已删除。

## 校验规则

| 规则 | code | 逻辑 |
|---|---|---|
| 首行格式 | `MISSING_SUBJECT` | 正则 `^(type)(scope)?:\s*(subject)$` |
| type 白名单 | `BAD_TYPE` | feat/fix/refactor/perf/test/docs/style/chore/build/ci/revert |
| subject 必须含中文 | `SUBJECT_NO_CHINESE` | CJK Unified 范围 |
| 禁止句号结尾 | `SUBJECT_ENDS_WITH_PUNCTUATION` | `。` 或 `.` |
| 禁止过去时 | `SUBJECT_PAST_TENSE` | `已修复`/`已实现`/`修复了`/`实现了` 等 |
| 禁止零信息 subject | `ZERO_INFO_SUBJECT` | update/bugfix/wip/修改/更新/改动 等单字 |
| 禁止 AI 署名 | `AI_SIGNATURE` | `Co-Authored-By:` 行含 claude/copilot/cursor/windsurf/cody，或 `Generated with Claude`，或 `AI-assisted` |

## 逃逸

- `GIT_COMMIT_HOOK_SKIP=1` 作为 bash 工具 env 字段或命令前缀

## 不做的事

这些规则主观性强，无法机械校验，保留在 skill 文档中由 agent 自行判断：

- body 是否解释 why vs what
- 多 commit 是否该拆分
- PR 标题格式

## 不支持的 message 格式

`parseGitCommitArgs` 用正则从命令字符串中提取 message，以下格式无法可靠解析，命中时视为 `fromFile=true` 跳过校验：

| 格式 | 例子 | 原因 |
|---|---|---|
| `-F path` / `--file path` | `git commit -F /tmp/msg` | message 来自文件，无法从命令字符串获取 |
| `--amend --no-edit` | `git commit --amend --no-edit` | 复用原有 message |
| Heredoc shell 展开 | `git commit -m "$(cat <<'EOF'..."` | ``'EOF'`` 的单引号会导致 `-m` 正则回溯匹配失败，提取到错误边界 |

遇到上述格式时，gate 自动放行（不校验也不阻断），相当于"信任人工输入"。

## 架构决策

- **仅插件层**：opencode 调度场景下所有 `git commit` 必经 bash 工具，插件层拦截即充分；删除 git 钩子层减少路径依赖
- **不修改规范文档**：规范收敛在 `userconf/AGENTS.md`，插件只做可执行部分

## 验证方式

```bash
# 单元测试
node --test userconf/plugins/test/git-commit-gate.test.mjs
```
