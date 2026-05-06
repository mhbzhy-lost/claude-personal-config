---
name: httpx-async-client
description: HTTPX AsyncClient 基础使用、连接池、细粒度超时与 HTTP/2 启用
tech_stack: [httpx]
language: [python]
capability: [http-client]
version: "httpx unversioned"
collected_at: 2025-01-01
---

# HTTPX AsyncClient

> Source: https://www.python-httpx.org/async/, https://www.python-httpx.org/advanced/clients/, https://www.python-httpx.org/http2/, https://www.python-httpx.org/advanced/timeouts/

## Purpose
掌握 HTTPX 的 `AsyncClient` 用法，包括异步请求、连接池复用、细粒度超时控制、HTTP/2 启用与版本检测，以及流式上传/下载。适用于需要高并发 HTTP 通信的 Python 异步项目。

## When to Use
- 需要高并发发出 HTTP 请求（async 效率远超多线程）
- 配合异步 Web 框架使用（FastAPI、Starlette 等）
- 需要连接复用以降低延迟和 CPU 开销
- 需要 HTTP/2 多路复用的场景
- 需要流式传输大文件（上传进度、下载进度、代理转发）

## Basic Usage

```python
import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        response = await client.get('https://www.example.com/')
        print(response.status_code, response.http_version)

asyncio.run(main())
```

**务必复用 Client 实例**——不要在热循环内反复 `async with AsyncClient()`，这会丧失连接池收益。将单个 client 作为作用域内的共享实例传递，或使用全局 client。

### 客户端级配置复用

```python
async with httpx.AsyncClient(
    base_url='https://api.example.com',
    headers={'user-agent': 'my-app/0.0.1'},
    timeout=httpx.Timeout(10.0, connect=60.0),
) as client:
    r = await client.get('/v1/data')  # 自动带 base_url + headers
```

合并规则：headers/params/cookies **合并**；auth/timeout 等**请求级覆盖客户端级**。

### 显式 Transport

```python
transport = httpx.AsyncHTTPTransport(retries=1)
async with httpx.AsyncClient(transport=transport) as client:
    ...
```

## Key APIs (Summary)

| API | 说明 |
|-----|------|
| `AsyncClient(...)` | 异步客户端，支持 http2、timeout、limits、base_url |
| `await client.get/post/...` | 异步请求方法（全部 await） |
| `async with client.stream(...)` | 流式响应上下文 |
| `await response.aiter_bytes()` | 异步字节流迭代 |
| `await response.aiter_text()` | 异步文本流迭代 |
| `response.http_version` | 实际使用的 HTTP 版本 |
| `response.num_bytes_downloaded` | 已下载字节数（监控进度） |
| `client.build_request(...)` | 构建 Request 实例（可修改后 send） |
| `await client.send(req, stream=True)` | 手动发送（需自行 aclose） |
| `await client.aclose()` | 显式关闭客户端 |

### 超时控制

默认 5s 网络不活跃超时。四类细粒度超时：

| 类型 | 含义 | 异常 |
|------|------|------|
| `connect` | 建立 TCP 连接 | `ConnectTimeout` |
| `read` | 等待接收数据块 | `ReadTimeout` |
| `write` | 等待发送数据块 | `WriteTimeout` |
| `pool` | 等待从连接池获取连接 | `PoolTimeout` |

```python
timeout = httpx.Timeout(10.0, connect=60.0, pool=30.0)
```

也可禁用：`timeout=None`。

### HTTP/2

需安装可选依赖：`pip install httpx[http2]`

```python
async with httpx.AsyncClient(http2=True) as client:
    r = await client.get('https://example.com')
    print(r.http_version)  # "HTTP/2" 或回退 "HTTP/1.1"
```

HTTP/2 不保证一定使用——需客户端和服务端同时支持。

### 流式请求与响应

**响应流（手动模式，用于代理转发）：**
```python
async def proxy(request):
    client = httpx.AsyncClient()
    req = client.build_request("GET", "https://backend.example.com/")
    r = await client.send(req, stream=True)
    return StreamingResponse(r.aiter_text(), background=BackgroundTask(r.aclose))
```

**请求流（异步生成器上传）：**
```python
async def upload_bytes():
    for chunk in chunks:
        yield chunk
await client.post(url, content=upload_bytes())
```

## Caveats
- **热循环内勿创建多个 client**——连接池白费。使用单个 scoped/global client。
- **手动流模式必须 `aclose()`**——否则连接泄漏。
- **HTTP/2 需额外安装 + 显式开启**——`pip install httpx[http2]` + `http2=True`。
- **HTTP/2 可能回退 HTTP/1.1**——检查 `response.http_version`。
- **默认超时仅 5s**——慢连接需调大或按请求配置。
- **Trio 后端需单独安装** trio 包。

## Composition Hints
- 配合 `httpx-session-cookies` 实现带会话保持的异步客户端
- 配合 `httpx-retries-tenacity` 为 AsyncClient 添加重试逻辑
- 配合 `httpx-proxy` 通过代理发出异步请求
- 在 FastAPI/Starlette 中作为后台 HTTP 客户端复用同一个 AsyncClient 实例
