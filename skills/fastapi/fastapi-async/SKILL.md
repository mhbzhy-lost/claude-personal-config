---
name: fastapi-async
description: "async/await 用法决策、BackgroundTasks 后台任务、并发请求处理、线程池执行同步代码、def 与 async def 的选择"
tech_stack: [fastapi, backend]
language: [python]
---

# FastAPI Async -- 异步与并发

> 来源：https://fastapi.tiangolo.com/async/ / https://fastapi.tiangolo.com/tutorial/background-tasks/
> 版本基准：FastAPI 0.115+（Python 3.10+）

## 用途

理解 FastAPI 的异步执行模型，正确选择 `def` 与 `async def`，使用 BackgroundTasks 执行后台任务，在异步上下文中安全调用同步代码。

## 何时使用

- 需要决定路由函数用 `def` 还是 `async def`
- 需要在响应返回后执行后台任务（发邮件、写日志）
- 需要并发调用多个外部 API
- 需要在 async 端点中调用同步阻塞库（如传统数据库驱动）

## def 与 async def 选择指南

### 核心决策树

```python
from fastapi import FastAPI

app = FastAPI()

# 1. 第三方库支持 await -> 用 async def
@app.get("/async-lib")
async def use_async_lib():
    result = await some_async_library()
    return result

# 2. 第三方库不支持 await（阻塞 I/O）-> 用 def
@app.get("/sync-lib")
def use_sync_lib():
    result = some_blocking_library()
    return result

# 3. 无外部 I/O -> 用 async def（最高效）
@app.get("/no-io")
async def no_io():
    return {"data": "computed locally"}

# 4. 不确定 -> 用 def（安全默认）
@app.get("/safe-default")
def safe_default():
    return {"data": "works"}
```

### 执行机制对比

| 声明方式 | 执行位置 | 适用场景 |
|----------|---------|---------|
| `async def` | 主事件循环 | 所有 I/O 都是 async 的 |
| `def` | 外部线程池 | 包含阻塞 I/O 调用 |

**关键理解**：
- `def` 路由被 FastAPI 自动放到线程池执行，不会阻塞事件循环
- `async def` 路由直接在事件循环执行，如果其中有阻塞调用会阻塞整个服务

```python
import time

# 错误：阻塞调用在 async def 中 -> 阻塞事件循环！
@app.get("/bad")
async def bad_endpoint():
    time.sleep(5)  # 整个服务阻塞 5 秒！
    return {"result": "delayed"}

# 正确：阻塞调用在 def 中 -> 自动线程池执行
@app.get("/good")
def good_endpoint():
    time.sleep(5)  # 在线程池中执行，不阻塞事件循环
    return {"result": "delayed"}
```

## 手动使用线程池

当 async 端点中必须调用同步代码时：

```python
from starlette.concurrency import run_in_threadpool
from fastapi import FastAPI

app = FastAPI()

def cpu_intensive_task(data: str) -> str:
    """模拟 CPU 密集型同步操作"""
    import hashlib
    result = hashlib.pbkdf2_hmac("sha256", data.encode(), b"salt", 100000)
    return result.hex()

@app.post("/process")
async def process(data: str):
    # 将同步函数放到线程池执行，不阻塞事件循环
    result = await run_in_threadpool(cpu_intensive_task, data)
    return {"result": result}
```

## 并发请求多个外部 API

### 使用 asyncio.gather

```python
import asyncio
import httpx
from fastapi import FastAPI

app = FastAPI()

async def fetch_url(client: httpx.AsyncClient, url: str) -> dict:
    response = await client.get(url)
    return response.json()

@app.get("/dashboard")
async def dashboard():
    async with httpx.AsyncClient() as client:
        # 并发请求三个 API
        users, orders, stats = await asyncio.gather(
            fetch_url(client, "https://api.example.com/users"),
            fetch_url(client, "https://api.example.com/orders"),
            fetch_url(client, "https://api.example.com/stats"),
        )
    return {"users": users, "orders": orders, "stats": stats}
```

### 使用 asyncio.TaskGroup（Python 3.11+，推荐）

```python
import asyncio
import httpx
from fastapi import FastAPI

app = FastAPI()

@app.get("/dashboard")
async def dashboard():
    results = {}
    async with httpx.AsyncClient() as client:
        async with asyncio.TaskGroup() as tg:
            async def fetch_and_store(key: str, url: str):
                response = await client.get(url)
                results[key] = response.json()

            tg.create_task(fetch_and_store("users", "https://api.example.com/users"))
            tg.create_task(fetch_and_store("orders", "https://api.example.com/orders"))
    return results
```

## BackgroundTasks 后台任务

### 基础用法

```python
from fastapi import BackgroundTasks, FastAPI

app = FastAPI()

def write_notification(email: str, message: str = ""):
    """同步后台任务"""
    with open("notifications.log", mode="a") as f:
        f.write(f"notification for {email}: {message}\n")

@app.post("/send-notification/{email}")
async def send_notification(email: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(write_notification, email, message="Welcome!")
    return {"message": "Notification will be sent in the background"}
```

响应立即返回，`write_notification` 在响应发送后执行。

### 在依赖中使用 BackgroundTasks

```python
from typing import Annotated
from fastapi import BackgroundTasks, Depends, FastAPI

app = FastAPI()

def write_log(message: str):
    with open("app.log", mode="a") as log:
        log.write(f"{message}\n")

def get_query(background_tasks: BackgroundTasks, q: str | None = None):
    if q:
        background_tasks.add_task(write_log, f"Query received: {q}")
    return q

@app.post("/items/")
async def create_item(
    background_tasks: BackgroundTasks,
    q: Annotated[str | None, Depends(get_query)],
):
    background_tasks.add_task(write_log, "Item created")
    return {"q": q}
```

FastAPI 会合并依赖和路由函数中添加的所有后台任务，统一在响应发送后执行。

### 异步后台任务

```python
import httpx
from fastapi import BackgroundTasks, FastAPI

app = FastAPI()

async def send_webhook(url: str, payload: dict):
    """异步后台任务"""
    async with httpx.AsyncClient() as client:
        await client.post(url, json=payload)

@app.post("/orders/")
async def create_order(background_tasks: BackgroundTasks):
    order = {"id": 1, "status": "created"}
    background_tasks.add_task(
        send_webhook,
        "https://webhook.example.com",
        {"event": "order_created", "data": order},
    )
    return order
```

`add_task` 同时支持 `def` 和 `async def` 函数。

## 依赖中的 async/sync 混用

```python
# async 依赖 -> 在事件循环中执行
async def get_async_db():
    async with AsyncSession() as session:
        yield session

# sync 依赖 -> 自动在线程池中执行
def get_sync_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 两者可以互相依赖，FastAPI 自动处理执行上下文切换
async def get_user(db = Depends(get_sync_db)):
    # 即使 db 来自 sync 依赖，也能在 async 函数中使用
    return db.query(User).first()
```

## httpx.AsyncClient 管理（推荐模式）

```python
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, Request

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 创建全局共享的 HTTP 客户端（连接池复用）
    app.state.http_client = httpx.AsyncClient(timeout=30.0)
    yield
    await app.state.http_client.aclose()

app = FastAPI(lifespan=lifespan)

@app.get("/proxy")
async def proxy(request: Request):
    client: httpx.AsyncClient = request.app.state.http_client
    response = await client.get("https://api.example.com/data")
    return response.json()
```

## 常见陷阱

- **async def 中使用阻塞调用**：这是最常见的性能杀手。`time.sleep()`、同步数据库驱动、`requests.get()` 等在 `async def` 中会阻塞整个事件循环。要么改用 `def`，要么用 `run_in_threadpool`
- **BackgroundTasks 不适合重计算**：BackgroundTasks 在同一进程内执行，对于 CPU 密集型或需要跨进程分发的任务，应使用 Celery、arq 等任务队列
- **忘记 await**：调用 async 函数但忘记 `await` 不会报错，只会返回一个协程对象而非结果
- **asyncio.gather 的异常处理**：默认一个任务失败不会取消其他任务，已完成的任务结果会丢失。使用 `return_exceptions=True` 或 `asyncio.TaskGroup`（会自动取消）
- **httpx.AsyncClient 不要每次请求创建**：通过 lifespan 管理全局客户端，复用连接池
- **def 路由的线程池是有限的**：默认 40 个线程（anyio 默认值），大量慢同步请求会耗尽线程池

## 组合提示

- 配合 **fastapi-dependencies** 理解 async/sync 依赖的执行上下文切换
- 配合 **fastapi-core** 使用 lifespan 管理全局 async 资源
- 配合 **fastapi-middleware** 了解中间件中的 async 执行
- 配合 **fastapi-testing** 测试异步端点和后台任务
