# bug: plan-runner 原子写临时文件名只含 pid

## 症状

`writeJsonAtomic` 使用固定临时路径：

```js
`${path}.tmp.${process.pid}`
```

同一进程内如果两个 hook 未来并发写同一个 state 文件，会共享同一个临时文件名。

## 影响

临时文件可能被覆盖或 rename 顺序错乱，导致最终 state 丢失后写入内容。

## 期望行为

每次原子写都使用唯一临时文件名。

## 实际行为

临时文件名只有目标路径和 pid，同一进程内不唯一。

## 根因

早期实现只考虑跨进程 pid 隔离，没有考虑同一 OpenCode 进程内异步 hook 重入。

## 修复方案

临时文件名增加 `randomUUID()` 后缀，保证每次写入唯一。

## 验证

单测检查 `plan-runner-harness.js` 不再使用只含 pid 的 temp 模式，并包含 `randomUUID`。
