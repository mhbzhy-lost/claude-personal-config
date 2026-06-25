# bug: plan-runner 读取损坏 task state JSON 时抛异常

## 症状

`plan-runner-harness` 的 `readJson` 直接执行：

```js
return JSON.parse(readFileSync(path, "utf8"))
```

当 `tasks/<task_id>.json` 或 `sessions/<session_id>.json` 被手动改坏、写入中断或磁盘异常导致 JSON 不完整时，任意读取该文件的 hook 都会抛出 `SyntaxError`。

## 影响

- OpenCode hook 可能因 state 文件损坏而中断，阻断后续工具调用或让 harness 失效。
- 损坏文件留在原路径，后续每次事件都会重复触发同样错误。

## 期望行为

harness 发现损坏 JSON 后应隔离该文件，避免同一坏文件持续污染后续事件；当前事件可以 fail-open 返回。

## 实际行为

`readJson` 没有捕获 `JSON.parse` 异常，也没有 `corrupt/` 隔离路径。

## 根因

早期 state storage 只实现了原子写入的 happy path，没有落地计划文档中的坏 JSON 隔离恢复路径。

## 修复方案

- `readJson` 捕获 JSON 解析错误。
- 将损坏文件移动到 state 根目录下的 `corrupt/<原目录名>/<原文件名>`。
- 读取方在拿到 `null` state/index 时 fail-open 返回，不继续访问属性。

## 验证

- 单测构造损坏 task state，触发 `session.idle` 不抛异常。
- 验证损坏文件被移动到 `corrupt/tasks/<task>.json`。
