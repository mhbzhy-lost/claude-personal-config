# opencode-cache-proxy 自动保活失效

## 现象

OpenCode 使用 `vendor/opencode-cache-proxy` 的 cached provider 时突然发不出请求。
本机健康检查显示 `127.0.0.1:48761` 未监听：

```text
curl --noproxy '*' http://127.0.0.1:48761/__bailian_cache_proxy/health
=> Connection refused
```

`ps` 中也没有 `bailian-cache-proxy` 进程。OpenCode 配置仍指向：

```text
http://127.0.0.1:48761/apps/anthropic/v1
http://127.0.0.1:48761/compatible-mode/v1
```

## 影响

所有指向 local cache proxy 的 OpenCode provider 都会失败，包括：

- `anthropic-idealab-cached`
- `openai-bailiab-api`
- `openai-bailian-token-plan`

非 cached provider 不受影响。

## 复现步骤

1. OpenCode 选择 cached provider 发请求。
2. proxy 进程不存在或已经 idle exit。
3. OpenCode 请求 `127.0.0.1:48761/...`，连接失败。

本次诊断中，直接运行 proxy 入口可以成功监听：

```text
BAILIAN_CACHE_PROXY_IDLE_EXIT_MS=3000 node vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy.mjs
=> bailian-cache-proxy listening on http://127.0.0.1:48761
```

说明失败点不是 proxy entrypoint 本身，而是 OpenCode plugin 自动启动/保活链路。

## 根因分析 6 要素

### 1. 直接原因

`bailian-cache-proxy` 进程已退出，`127.0.0.1:48761` 无监听进程。OpenCode provider 仍把请求发到该端口，因此请求失败。

### 2. 触发条件

usage 日志显示 2026-06-02 17:30 左右仍有成功转发记录，且记录中的 `proxy_pid=66028`。随后当前系统中没有该 proxy 进程，健康检查变为 `Connection refused`。

### 3. 代码路径

OpenCode plugin 启动 proxy 并发送 heartbeat：

- `vendor/opencode-cache-proxy/plugins/bailian-cache-proxy.js`
- 初始化时 health check 失败则 `spawn(node, [proxyEntry])`
- 初始化后向 `/__bailian_cache_proxy/heartbeat` 注册 `process.pid`
- 定时每 15 秒继续 heartbeat

proxy lifecycle 判断：

- `vendor/opencode-cache-proxy/proxy/src/server.mjs`
- 若没有 active parent heartbeat，且 `lastActiveAt` 超过 `idleExitMs`，执行 `server.close(() => process.exit(0))`
- heartbeat TTL 来自 `vendor/opencode-cache-proxy/proxy/src/lifecycle.mjs`，默认 45 秒

### 4. 根因假设

OpenCode plugin 的 heartbeat 没有持续生效，proxy 在最后一次请求后进入无 active parent 状态，并按 lifecycle idle exit 退出。

支持证据：

- proxy entrypoint 可直接启动，排除入口启动失败。
- OpenCode config provider/baseURL 正常，排除 provider URL 被改坏。
- `~/.config/opencode/plugins/bailian-cache-proxy.js` symlink 存在且指向正确。
- usage 日志中 17:30 前有成功转发，说明 proxy 曾经正常运行。
- 当前没有 proxy 进程且端口 refused。

未完全确认的点：

- OpenCode 1.15.12 当前是否加载了该 plugin。
- plugin 中 `setInterval(...).unref?.()` 在 OpenCode plugin runtime 中是否可能导致 heartbeat worker 不持续。
- OpenCode 重启/会话切换后是否没有重新执行 plugin 初始化。

### 5. 为什么之前没暴露

proxy 只要进程仍在，OpenCode 请求会成功；如果 OpenCode plugin heartbeat 在某些会话里有效，proxy 会被保活。问题只在 heartbeat 中断、OpenCode 未重新拉起 proxy、或 proxy idle exit 后继续使用 cached provider 时暴露。

### 6. 防复发方向

修复前需要用户确认。候选方向：

- 在 OpenCode plugin 中不要对 heartbeat timer `unref()`，确保 plugin runtime 维持定时 heartbeat。
- 在每次 OpenCode 请求前的 hook 中做 health check/start，而不是只在 plugin 初始化时启动一次。
- 增加 `server.connected` 或 `session.*` hook，确保 OpenCode 新会话/重连时重新注册 heartbeat。
- 增加更明确的 plugin startup 日志或 stderr fallback，避免 plugin 未加载时无证据。

## 临时恢复

不改代码的恢复方式：

```bash
node "$CLAUDE_CONFIG_HOME/vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy.mjs"
```

保持该命令运行后，OpenCode cached provider 应重新能连到 `127.0.0.1:48761`。

更干净的恢复方式是重启 OpenCode，让 plugin 重新尝试启动 proxy；但如果 heartbeat 问题仍在，后续仍可能再次 idle exit。

## 2026-06-02 更新：register/unregister 绑定到错误生命周期

后续把 OpenCode plugin 从周期 heartbeat 改成：

- plugin 初始化时 `/register { pid: process.pid }`
- plugin `beforeExit` / `SIGINT` / `SIGTERM` 时 `/unregister { pid }`

用户反馈：每次对话结束 proxy 就退出，但并没有退出 OpenCode 进程。

复查证据：

```text
ps aux | rg "opencode|bailian-cache-proxy|48761"
=> opencode -c 仍在运行，PID=79673
=> 无 bailian-cache-proxy 进程

curl --noproxy '*' http://127.0.0.1:48761/__bailian_cache_proxy/health
=> Connection refused
```

这说明 `beforeExit` / signal hook 绑定到的生命周期不是用户理解的长期
OpenCode 进程生命周期。可能是 OpenCode plugin runtime / JS bridge / per-turn
执行上下文在对话结束时退出或触发 cleanup，导致 `/unregister` 被发送，proxy
引用集合归 0 后 idle exit。

新的根因判断：

- 不能用 plugin runtime 的 `process.pid` + `beforeExit` 代表 OpenCode 主进程。
- 引用集合仍应存 pid，而不是裸计数。
- 但 pid 必须是稳定的 OpenCode 会话进程 pid；如果拿不到稳定 pid，就不应在
  plugin cleanup 中主动 unregister。
- 异常退出清理应优先依赖 proxy 侧 `kill(pid, 0)` prune，而不是 plugin 侧
  `beforeExit` 主动删除。

候选修复方向：

1. 删除 OpenCode plugin 的主动 `/unregister`，仅 `/register`；proxy 侧用
   `pidIsAlive`/TTL 清理。前提：`process.pid` 是稳定 OpenCode 主进程 pid。
2. 如果 `process.pid` 是短生命周期 plugin runtime pid，则改注册稳定父进程 pid
   （例如 `process.ppid` 或 OpenCode 暴露的 session/client pid）。
3. 如果无法可靠获取稳定 pid，则 OpenCode plugin 回到“启动即常驻”，不做
   unregister；只保留手动 stop 或 Qwen hook 这类明确 SessionEnd 的退出路径。

## 2026-06-02 更新：旧 proxy 健康但仍带 idle 退出

用户反馈：去掉 unregister/pid 之后，当前 OpenCode 进程未退出，但 proxy 再次挂。

现场证据：

```text
ps -p <opencode_pid> -o pid,lstart,command
=> 16358 Tue Jun  2 20:17:24 2026 opencode -c

curl --noproxy '*' http://127.0.0.1:48761/__bailian_cache_proxy/health
=> Connection refused

ps aux | rg "bailian-cache-proxy|opencode -c"
=> opencode -c 仍在
=> 无 bailian-cache-proxy 进程

tail ~/.cache/bailian-cache-proxy/usage.jsonl
=> 最后一批请求 proxy_pid=8145，最后时间 2026-06-02T13:40:29Z

ps -p 8145 -o pid,lstart,command
=> 无进程
```

当前 OpenCode 启动日志：

```text
2026-06-02T12:17:27 service=bailian-cache-proxy baseUrl=http://127.0.0.1:48761 proxy ensured
```

这说明新插件确实运行了，但启动时 48761 上已有旧 proxy 健康，因此插件没有
spawn 新 proxy，也就没有给旧进程补上 `BAILIAN_CACHE_PROXY_IDLE_EXIT_MS=0`。
随后旧进程仍按旧默认 idle 生命周期退出，导致当前 OpenCode 进程继续运行但
cached provider 连接本地端口失败。

根因判断：

- 仅在插件 spawn 时设置 `BAILIAN_CACHE_PROXY_IDLE_EXIT_MS=0` 不够。
- proxy entrypoint/server 默认仍是 idle exit，任何非新插件拉起的进程都会继承
  旧风险，包括旧进程、手动启动、或未带 env 的启动路径。
- health check 只能证明“当前能连”，不能证明该 proxy 的生命周期策略可靠。

修复方向：

- proxy 默认不做 idle exit：`BAILIAN_CACHE_PROXY_IDLE_EXIT_MS` 默认改为 `0`。
- 如需显式空闲退出，由调用方主动设置正数。
- 保留插件/Qwen hook 传 `0`，但不再把“不退出”依赖在启动方 env 上。
