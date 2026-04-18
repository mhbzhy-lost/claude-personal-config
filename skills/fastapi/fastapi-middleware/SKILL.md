---
name: fastapi-middleware
description: "中间件机制、CORS 配置、GZip/TrustedHost/HTTPS 中间件、自定义中间件、异常处理器"
tech_stack: [fastapi, backend]
language: [python]
capability: [web-framework, observability]
---

# FastAPI Middleware -- 中间件与异常处理

> 来源：https://fastapi.tiangolo.com/tutorial/middleware/ / https://fastapi.tiangolo.com/tutorial/cors/ / https://fastapi.tiangolo.com/advanced/middleware/ / https://fastapi.tiangolo.com/tutorial/handling-errors/
> 版本基准：FastAPI 0.115+（Python 3.10+）

## 用途

中间件在每个请求到达路由之前和每个响应返回客户端之前执行，用于横切关注点处理。异常处理器统一处理应用中抛出的各类异常。

## 何时使用

- 需要为所有请求添加通用处理（日志、计时、请求 ID）
- 配置跨域资源共享（CORS）
- 启用响应压缩（GZip）
- 统一异常格式、添加错误日志
- 实现请求限流、IP 白名单等安全策略

## 自定义中间件

### @app.middleware 装饰器

```python
import time
from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    process_time = time.perf_counter() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response
```

### 基于类的中间件（Starlette BaseHTTPMiddleware）

```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import uuid

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

app.add_middleware(RequestIDMiddleware)
```

### 纯 ASGI 中间件（性能最优）

```python
from fastapi import FastAPI

app = FastAPI()

class PureASGIMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # 请求前处理
            await self.app(scope, receive, send)
            # 注意：纯 ASGI 中间件无法方便地修改响应
        else:
            await self.app(scope, receive, send)

app.add_middleware(PureASGIMiddleware)
```

## 中间件执行顺序

```python
app.add_middleware(MiddlewareA)
app.add_middleware(MiddlewareB)
```

**请求方向**：MiddlewareB -> MiddlewareA -> 路由处理函数
**响应方向**：路由处理函数 -> MiddlewareA -> MiddlewareB

最后添加的中间件最先处理请求（洋葱模型，后进先出）。

## CORS 跨域配置

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

origins = [
    "http://localhost:3000",
    "http://localhost:8080",
    "https://myapp.example.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,           # 允许的源列表，或 ["*"]
    allow_credentials=True,          # 允许携带 Cookie
    allow_methods=["*"],             # 允许的 HTTP 方法
    allow_headers=["*"],             # 允许的请求头
    expose_headers=["X-Request-ID"], # 浏览器可访问的响应头
    max_age=600,                     # 预检请求缓存时间（秒）
)
```

**关键限制**：当 `allow_credentials=True` 时，`allow_origins` 不能使用 `["*"]`，必须显式列出域名。

也可以使用正则匹配源：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.example\.com",
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 内置中间件

### GZip 压缩

```python
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(
    GZipMiddleware,
    minimum_size=1000,       # 最小压缩字节数（默认 500）
    compresslevel=5,         # 压缩级别 1-9（默认 9，越高越慢但越小）
)
```

### Trusted Host（防 Host 头攻击）

```python
from fastapi.middleware.trustedhost import TrustedHostMiddleware

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["example.com", "*.example.com"],
)
```

### HTTPS 重定向

```python
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware

app.add_middleware(HTTPSRedirectMiddleware)
# http 请求自动 301 到 https
```

## 异常处理器

### HTTPException

```python
from fastapi import FastAPI, HTTPException

app = FastAPI()

@app.get("/items/{item_id}")
async def read_item(item_id: str):
    if item_id not in items:
        raise HTTPException(
            status_code=404,
            detail="Item not found",
            headers={"X-Error": "Item does not exist"},
        )
    return items[item_id]
```

`detail` 可以是任意 JSON 可序列化对象（dict, list 等），不仅限于字符串。

### 自定义异常类 + 处理器

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

class BusinessError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code

app = FastAPI()

@app.exception_handler(BusinessError)
async def business_error_handler(request: Request, exc: BusinessError):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": exc.code,
            "message": exc.message,
            "path": str(request.url),
        },
    )

@app.get("/orders/{order_id}")
async def get_order(order_id: str):
    if order_id == "invalid":
        raise BusinessError(
            code="ORDER_NOT_FOUND",
            message="订单不存在",
            status_code=404,
        )
    return {"order_id": order_id}
```

### 覆盖默认验证错误处理器

```python
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

app = FastAPI()

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
):
    return JSONResponse(
        status_code=422,
        content={
            "message": "请求参数验证失败",
            "detail": jsonable_encoder(exc.errors()),
            "body": jsonable_encoder(exc.body),
        },
    )
```

### 复用默认处理器 + 添加日志

```python
import logging
from fastapi import FastAPI, HTTPException
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)
app = FastAPI()

@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request, exc):
    logger.error(f"HTTP error: {exc.status_code} {exc.detail}")
    return await http_exception_handler(request, exc)

@app.exception_handler(RequestValidationError)
async def custom_validation_exception_handler(request, exc):
    logger.warning(f"Validation error: {exc}")
    return await request_validation_exception_handler(request, exc)
```

> 注意：要捕获 FastAPI 和 Starlette 两者抛出的 HTTPException，应注册 `starlette.exceptions.HTTPException` 的处理器。

## 完整中间件配置示例

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(lifespan=lifespan)

# 中间件按添加的逆序执行，建议按以下顺序添加
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://myapp.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["myapp.com", "*.myapp.com"],
)
```

## 常见陷阱

- **中间件顺序反直觉**：最后添加的中间件最先处理请求。如果 CORS 中间件需要最先执行（处理 OPTIONS 预检），它应该最后添加（或第一个 `add_middleware` 调用）
- **BaseHTTPMiddleware 的流式响应问题**：`BaseHTTPMiddleware` 会缓冲整个响应体，对于大文件流式传输或 SSE 可能导致问题，此时应使用纯 ASGI 中间件
- **中间件中不能使用 Depends**：中间件在依赖注入系统之外运行，不能使用 `Depends()`
- **call_next 只能调用一次**：`await call_next(request)` 在每个中间件中只能调用一次
- **CORS allow_credentials 与 allow_origins=["*"] 互斥**：浏览器规范不允许两者同时使用
- **异常处理器注册 Starlette 的 HTTPException**：FastAPI 的 HTTPException 继承自 Starlette，只注册 FastAPI 版本可能遗漏 Starlette 内部抛出的异常
- **yield 依赖在中间件之后执行**：yield 依赖的清理代码在所有中间件完成后才执行

## 组合提示

- 配合 **fastapi-auth** 在中间件层实现全局认证检查
- 配合 **fastapi-core** 了解中间件在 FastAPI 实例上的配置方式
- 配合 **fastapi-async** 理解中间件中的 async 执行模型
- 配合 **fastapi-testing** 测试自定义异常处理器的行为
