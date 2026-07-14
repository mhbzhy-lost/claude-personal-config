# Plan-Runner 派发失败遗留非终态资源

## 1. 现象

在 `session.create` 或 `promptAsync` 失败前，派发路径可能已经创建 worktree、state 或 registry 记录。异常被直接抛出后，这些资源没有收敛为终态，后续运行将其视为仍在执行或占用中。

## 2. 影响

用户无法可靠重试同一任务，状态长期停留在非终态；遗留的 worktree 和 registry 可能阻塞后续派发、造成错误诊断，或要求人工清理。

## 3. 复现条件

让派发前置资源创建成功，再令 `session.create` 返回明确 SDK error；或令 `session.create` 成功后让 `promptAsync` 返回明确失败。另一类复现是让任一调用直接抛出 transport timeout：此时客户端无法判断服务端是否已经接受请求。

## 4. 根因

派发被实现为一条成功导向的线性链路：先创建资源，再创建会话和投递提示；异常路径直接向上抛出，没有把已完成的前置副作用与失败结果原子关联。更关键的是，明确返回的 SDK error 与 transport throw 被当成同一种失败；后者的投递结果未知，若伪造终态并释放 runtime，可能中断服务端实际已经接受的 root。

## 5. 修复方向

为派发建立显式分流：SDK `{ error }` 表示明确拒绝，写入 `interrupted`、终态 barrier 和同步错误交付记录；直接 throw 表示投递结果未知，只写 `dispatch_delivery.status=unknown` 诊断，保留 `dispatching` 或 `planning_required`，不得写终态 barrier 或触发 disposal。后续真实 root 事件仍可推进状态；没有事件时由人工诊断处理保留现场。

## 6. 验证与防回归

分别模拟 `session.create` 与 `promptAsync` 返回 SDK error 和直接 throw。断言明确拒绝进入可诊断终态并可在 parent idle 安全回收；transport throw 保持非终态、无 terminal barrier、无 parent notification，parent idle 不得释放可能仍运行的 runtime。两类路径都保留 worktree、registry 和已知 session id 供诊断。
