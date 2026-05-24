# Qwen cache proxy hook timeout 根因分析

**现象**：启动 Qwen Code 后，`curl http://127.0.0.1:48761/__bailian_cache_proxy/health`
返回 `{"ok":true,"activePids":[]}`。proxy 进程已监听 `127.0.0.1:48761`
（本次为 pid `93117`），但没有 keepalive 心跳登记。Qwen debug 日志
`~/.qwen/debug/dd33f126-12c6-4b02-bcda-8969abd0bb7e.txt` 显示：
`Hook bailian-cache-proxy-start ended for event SessionStart: failed`，错误为
`Hook timed out after 10000ms`。修复 hook timeout 后，手工运行
`node .../bailian-cache-proxy-qwen-hook.mjs start` 能在 0.34 秒退出，但 health
仍返回 `{"ok":true,"activePids":[]}`；直接运行 `keepalive --pid-file ...`
会在 0.09 秒退出。

**调用链**：Qwen Code 启动 → 读取 `~/.qwen/settings.json` 的 `SessionStart`
hook → 执行 `node .../bailian-cache-proxy-qwen-hook.mjs start` → CLI 读取 hook
stdin 并调用 `startQwenKeepalive()` → `ensureProxyRunning()` 用 detached child
启动 `bailian-cache-proxy.mjs` → `startQwenKeepalive()` 再用 detached child 启动
同一个 hook 的 `keepalive` 子命令 → start hook 进程本应返回给 Qwen Code →
实际 start hook 一直未退出，10 秒后被 Qwen Code 判定超时。即使 start hook
能正常返回，`keepalive` 子命令也会在第一次心跳后退出，后续没有持续心跳。

**根因假设**：

1. `start` 子命令给 proxy / keepalive 子进程配置了 `stdio: ["ignore", "ignore", "pipe"]`，
   并在父进程中监听 `child.stderr`；pipe 仍被 Node event loop 引用，导致
   start hook 父进程无法自然退出。
2. Qwen Code 没有关闭 hook stdin，导致 `readStdin()` 一直等待输入结束。
3. keepalive 子进程启动后立即崩溃，导致 activePids 为空。
4. keepalive 子进程把唯一的定时器 `unref()`，导致进程没有 refed handle，
   第一次心跳完成后自然退出。

**验证方式**：

- Qwen debug 日志确认 SessionStart hook 被执行并在 10 秒超时。
- `lsof -nP -iTCP:48761 -sTCP:LISTEN` 确认 proxy 已由 hook 拉起。
- `/var/folders/.../T/bailian-cache-proxy/qwen-*.pid` 存在 pidfile，但
  `ps -p <pid>` 查不到 keepalive 进程，说明 keepalive 未持续。
- 对照源码：`proxy/src/qwen-lifecycle.mjs` 的 `startProxyProcess()` 和
  `startQwenKeepalive()` 都为 detached child 使用 stderr pipe 并挂 listener；
  这会让一次性 hook 命令保持事件循环活跃，符合 10 秒超时现象。
- 修复 stderr pipe 后，`keepalive --pid-file ...` 仍会 0.09 秒退出；对照源码：
  `runQwenKeepalive()` 创建 interval 后立即 `timer.unref()`。该进程没有其它
  refed handle，信号监听不能保证进程常驻，符合 keepalive pidfile 指向死进程。

**根因确认**：根因包含两段：一次性 Qwen `start` hook 启动 detached 子进程时
保留 stderr pipe 和 listener，导致 hook 进程不能及时退出；同时 keepalive 子进程
把自己的 interval `unref()`，第一次心跳后自然退出，proxy 因此没有稳定的
`activePids`。

**影响范围**：所有通过 Qwen Code `SessionStart` 自动启动 cache proxy 的路径都会
受影响。OpenCode plugin 路径不受同一症状影响，因为 plugin 进程本身是常驻进程；
手动运行 `node proxy/bin/bailian-cache-proxy.mjs` 也不受影响。Qwen `SessionEnd`
hook 可能因 stale pidfile 找不到 keepalive pid，只能清理文件，无法正确驱动 proxy
按客户端生命周期退出。

**修复方案要求**：

- 针对 Qwen 一次性 hook 的子进程启动路径，不保留会阻止父进程退出的 pipe。
- keepalive 自身的心跳 interval 必须保持 ref 状态，让 detached 子进程持续存在。
- 保留可诊断性：Qwen start hook 不在父进程保留 pipe，但将子进程 stderr
  重定向到 state dir 内的 `qwen-cache-proxy.stderr.log`。
- 补充单测覆盖：`startQwenKeepalive()` 启动 proxy / keepalive 时应使用不会让父
  hook 挂起的 stdio；`runQwenKeepalive()` 不应 unref 心跳 interval；keepalive
  仍能登记心跳。
- 修复后验证：重跑 `npm test`，杀掉 proxy 后启动 Qwen Code，确认 health 中
  `activePids` 非空。
