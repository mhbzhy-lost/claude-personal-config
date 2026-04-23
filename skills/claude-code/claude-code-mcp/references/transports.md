# MCP Transport 协议细节

> 来源：https://modelcontextprotocol.io/specification/2025-06-18/basic/transports

MCP 使用 JSON-RPC 编码消息，必须 UTF-8。协议定义两种标准传输：**stdio** 和 **Streamable HTTP**（其中 SSE 只是 HTTP 的一个可选子模式）。历史上存在的独立 SSE 传输已 **deprecated**。

## stdio Transport

```
┌────────┐  stdin (JSON-RPC lines)  ┌──────────┐
│ client │──────────────────────────▶│  server  │
│        │◀──────────────────────────│  (child  │
└────────┘  stdout (JSON-RPC lines)  │  proc)   │
                                     │  stderr  │──▶ log
                                     └──────────┘
```

规则：
- 客户端把 server 作为子进程启动
- 消息按**行**分割（`\n`），每行一个 JSON-RPC 请求/响应/通知
- 消息体内**不得**出现换行
- server 可把日志写到 stderr，client 可自行捕获/转发/忽略
- server **不得**往 stdout 写任何非 MCP 消息
- client **不得**往 stdin 写任何非 MCP 消息
- 客户端**应当**首选支持 stdio

特性：进程级隔离；零网络开销；10k+ ops/sec；可直接访问本地文件/硬件/命令。

## Streamable HTTP Transport（现代标准）

服务器暴露**单个 MCP endpoint**（如 `https://example.com/mcp`），同时支持 POST 和 GET。

### Client → Server（POST）

1. 每条消息都是一次新的 HTTP POST
2. 必须带 `Accept: application/json, text/event-stream`
3. Body 是单条 JSON-RPC 消息
4. 如果 body 是响应或通知：
   - 接受：`202 Accepted`，无 body
   - 拒绝：4xx
5. 如果 body 是请求，server 返回：
   - `Content-Type: application/json` + 单个 JSON 响应，**或**
   - `Content-Type: text/event-stream` + SSE 流（用来推送多条消息，直到请求完成）

### Server → Client（GET / SSE）

1. Client 可以发起 HTTP GET 到同一 endpoint，打开一条 SSE 通道
2. 必须带 `Accept: text/event-stream`
3. Server 返回 `Content-Type: text/event-stream` 或 `405 Method Not Allowed`（表示不支持被动推送）

### 协议版本头

HTTP 传输下，**所有**后续请求都要带：
```
MCP-Protocol-Version: 2025-06-18
```

### 会话管理

- Server 可在 `InitializeResult` 响应头里分配 `Mcp-Session-Id`
- 一旦收到，client 在**所有**后续请求里回传这个 id，直到会话终止

### 安全告警

- Server **必须**校验 `Origin` 头，防 DNS rebinding
- 本机运行时**应**只绑 `127.0.0.1`，不要 `0.0.0.0`
- 对所有连接做认证（Bearer / OAuth / mTLS）

### 自动重连

Claude Code 对 HTTP/SSE 断连指数退避重试 5 次（1s → 2s → 4s → 8s → 16s），`/mcp` 中服务器状态为 pending；5 次全失败则标记 failed，需手动重试。stdio 不自动重连。

## SSE Transport（Deprecated）

旧版独立 SSE 协议。客户端用 GET 建立一条长连接接收 server 推送；反向消息走另一个 HTTP POST endpoint。新项目禁用，Claude Code 仅保留向后兼容。

## 对比速查

| 维度                  | stdio                 | Streamable HTTP       | SSE (Deprecated)     |
|-----------------------|-----------------------|-----------------------|-----------------------|
| 部署位置              | 本地子进程            | 远端服务              | 远端服务              |
| 性能                  | 10,000+ ops/sec       | 100–1,000 ops/sec     | 100–1,000 ops/sec     |
| 多连接                | 单进程单连接          | 多客户端并发          | 多客户端并发          |
| 推送/流               | ✗（靠行顺序）         | ✔（SSE 可选）         | ✔                     |
| 认证                  | 系统/env              | HTTP headers / OAuth  | HTTP headers          |
| Session ID            | 无                    | `Mcp-Session-Id` 头   | 实现相关              |
| 推荐度                | 本地首选              | 远程首选              | 勿用                  |

## 自定义传输

协议是传输无关的。实现者只要保证 JSON-RPC 消息格式与生命周期（initialize / initialized / shutdown）不变，可以自建传输层。
