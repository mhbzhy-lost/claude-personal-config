# bug: plan-runner corrupt state 隔离失败会破坏 fail-open

## 症状

读取损坏 task state JSON 时，如果移动到 `corrupt/` 目录的 `rename` 失败，hook 会抛错。

## 影响

磁盘满、权限变化或目标路径冲突时，坏 JSON 本应被视为 inactive state，但 rename 失败会让 hook 崩溃并阻断 OpenCode 正常运行。

## 期望行为

损坏 JSON 无论是否成功隔离，都不应让 hook 崩溃；读取结果应 fail-open 为 `null`。

## 实际行为

`quarantineCorruptJson` 未捕获 `rename` 异常，`readJson` 将异常继续向上抛出。

## 根因

corrupt JSON 恢复路径只覆盖了 happy path，没有覆盖隔离目录不可写或目标冲突的错误路径。

## 修复方案

捕获 quarantine 失败并返回 `null`，`readJson` 在 `SyntaxError` 分支始终 fail-open。

## 验证

单测预创建冲突目录让 quarantine rename 失败，确认 `session.idle` 不抛错。
