# bug: opencode probe 启动轮询反复读取完整日志

## 症状

`waitForServer` 等待 `opencode serve` 就绪时，每轮都读取整个 `opencode-serve.log`。

## 影响

如果 DEBUG 日志较大，轮询期间 I/O 和内存分配会随日志长度增长，可能放大启动耗时并导致 15 秒就绪判断误报失败。

## 期望行为

轮询只读取上次检查后新增的日志内容。

## 实际行为

每次循环都从文件头读取完整日志并执行字符串搜索。

## 根因

最初实现优先保证诊断可用，没有记录已读取的字节偏移。

## 修复方案

新增 `readTextFromOffset`，`waitForServer` 维护 offset 与最近日志窗口，仅扫描增量内容。

## 验证

单测覆盖追加日志后只返回新增字节；probe 测试全部通过。
