---
name: fastapi-rate-limiting
description: 使用 SlowAPI 为 FastAPI 添加路由级 / 全局限流，支持 Redis / Memcached / 内存后端
tech_stack: [fastapi, slowapi, starlette]
language: [python]
capability: [web-framework]
version: "slowapi unversioned (alpha)"
collected_at: 2026-04-18
---

# FastAPI 限流（SlowAPI）

> 来源：https://github.com/laurentS/slowapi

## 用途
基于 [limits](https://github.com/alisaifee/limits/) 的 FastAPI/Starlette 限流库，从 flask-limiter 移植。支持路由级装饰器限流、全局默认限流、多后端存储，超限返回 HTTP 429。

## 何时使用
- 按 IP / 用户 / 自定义 key 限制请求频率
- 公共 API 防刷、登录防爆破、昂贵端点配额
- 需要 Redis 做多实例共享限流状态

## 基础用法
```bash
pip install slowapi
```

```python
from fastapi import FastAPI, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 必须：@app.get 在上，@limiter.limit 在下；参数必须显式包含 request: Request
@app.get("/home")
@limiter.limit("5/minute")
async def home(request: Request):
    return {"ok": True}
```

### 全局默认限流
```python
from slowapi.middleware import SlowAPIMiddleware, SlowAPIASGIMiddleware

limiter = Limiter(key_func=get_remote_address, default_limits=["1/minute"])
app.state.limiter = limiter
app.add_middleware(SlowAPIASGIMiddleware)  # 推荐 ASGI 版本
```

### Redis 后端
```python
limiter = Limiter(key_func=get_remote_address,
                  storage_uri="redis://host:6379/0")
```

## 关键 API
- `Limiter(key_func, default_limits=[...], storage_uri=..., enabled=True, key_style="url"|"endpoint")`
- `@limiter.limit("5/minute")` / `"100/hour"` / `"10/second;1000/day"`（多限制）
- `@limiter.exempt`：豁免某路由
- `@limiter.limit("100/minute", cost=callable)`：动态 hit 成本
- `SlowAPIMiddleware`（BaseHTTPMiddleware）/ `SlowAPIASGIMiddleware`（推荐）
- `limiter.enabled = False`：运行时关闭（测试常用）

**key_style**：
- `"url"`（默认）：key 含完整路径，`/r/1` 与 `/r/2` 独立计数
- `"endpoint"`：按视图函数名计数，路径参数共享限制

## 注意事项
- **必须显式 `request: Request` 参数**，否则 slowapi 无法 hook
- **装饰器顺序**：`@router.get` 必须在 `@limiter.limit` 之上，反之失效
- **需要修改响应头**：返回非 `Response` 对象时，在签名加 `response: Response` 并开启 `headers_enabled=True`
- **WebSocket 不支持**
- **Alpha 质量**：API 可能变更
- **推荐 ASGI 中间件**：Starlette 计划废弃 `BaseHTTPMiddleware`，ASGI 版本更快且原生支持 async 异常处理

## 组合提示
与 fastapi-cache2 搭配：先限流再走缓存；与 OpenTelemetry 搭配追踪 429 事件；自定义 `key_func` 结合 JWT 做按用户限流。
