# Plan-Runner 异步启动终态回流缺失

## 1. 现象

`start_plan_runner` 调用同步 `session.prompt()`，会阻塞父 agent，直到 Plan-Runner root 会话返回文本；这与后台派发只等待服务端接受的预期不符。

## 2. 影响

父 agent 在 Plan-Runner 执行期间不能继续调用工具。若只把调用替换为 `promptAsync()` 而不补充事件归集，root 的完成、阻塞或异常终态也无法回流给父会话。

## 3. 复现条件

创建 Plan-Runner 会话后，令 SDK 派发 Promise 在未接受时保持 pending；现有实现要求 `client.session.prompt`，并在调用返回后读取 final text 和写入 blocked 状态。

## 4. 根因

同步 `session.prompt()` 被赋予三项隐含职责：等待 Plan-Runner 执行完成、读取最终文本、保证 parent idle 晚于 child 尾部 message/idle 事件。`promptAsync()` 的 HTTP 204 仅表示请求已被接受，不包含执行结果、最终文本或终态事件；当前实现没有将后两项职责转移到 root message/idle/error 的异步事件处理路径。

## 5. 修复方向

启动路径仅等待 `session.promptAsync()` 返回 204，并持久化 accepted 派发事件后立即返回启动报告。root 会话的 message、idle 和 error 事件独立归集 validated、blocked、interrupted 等终态，并通过终态通知异步唤醒父会话。

## 6. 验证与防回归

新增 RED 覆盖：204 前启动 Promise 不得返回，204 后必须立即返回且 metadata 标明 accepted/background/sessionId/planning_required；SDK error 必须抛出，不能被标记为 accepted。后续 GREEN 需验证 root 未产生 message/idle/final 时仍不会阻塞启动。
