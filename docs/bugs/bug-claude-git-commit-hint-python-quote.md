# Bug: Claude git-commit hook 内嵌 Python 单引号破坏 shell 解析

## 现象

`test_claude_git_commit_hook_uses_env_escape` 调用
`claude/hooks/git-commit-hint.sh` 时 stdout 为空，导致 JSON 解析失败。手动探测 stderr：

```text
claude/hooks/git-commit-hint.sh: command substitution: line 138:
syntax error near unexpected token `('
```

## 根因 (6 要素)

1. **触发条件**：执行 `claude/hooks/git-commit-hint.sh`。
2. **期望链路**：脚本读取 hook payload，检测 `git commit`，输出结构化 deny JSON。
3. **实际链路**：脚本用 `python3 -c '...'` 内嵌 Python；Python 代码中又出现
   `r'...'` 单引号字符串，提前闭合了 shell 单引号。
4. **关键假设失效**：内嵌 Python 代码可以随意使用 Python 单引号字符串。shell
   单引号包裹下这个假设不成立。
5. **旁证**：Codex 端同类 hook 使用双引号 raw string，不触发该 shell 解析错误。
6. **实现偏差**：hook 运行失败后外层脚本按“渲染失败则放行”路径返回空输出，
   让测试表现为 JSON 缺失而不是直接暴露 shell 语法错误。

## 修复方向

- 将内嵌 Python 正则字符串改为双引号，避免破坏 shell 单引号边界。
- 保持逃生舱和共享文案逻辑不变。

## 修复记录

- `claude/hooks/git-commit-hint.sh` 的内嵌 Python 正则已改为双引号字符串。
- hook 顶部说明同步为当前策略：commit 阶段负责 git-commit skill 与知识文档判断，
  异源 review 由 push hook 执行。
