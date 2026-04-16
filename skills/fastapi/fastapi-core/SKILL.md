---
name: fastapi-core
description: "FastAPI 应用实例创建、项目结构组织、Uvicorn/FastAPI CLI 启动、lifespan 生命周期事件、配置管理（BaseSettings）"
tech_stack: [fastapi, backend]
language: [python]
---

# FastAPI Core -- 应用基础与项目结构

> 来源：https://fastapi.tiangolo.com/tutorial/first-steps/ / https://fastapi.tiangolo.com/advanced/events/ / https://fastapi.tiangolo.com/advanced/settings/
> 版本基准：FastAPI 0.115+（Python 3.10+）

## 用途

FastAPI 应用实例的创建、启动方式、生命周期管理和配置体系。覆盖从单文件原型到多模块项目的完整基础设施。

## 何时使用

- 新建 FastAPI 项目时选择启动方式与项目布局
- 需要在应用启动/关闭时初始化或释放资源（数据库连接池、ML 模型、缓存）
- 需要从环境变量 / .env 文件加载配置
- 将单文件应用拆分为多模块项目

## 最小应用

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}
```

## 启动方式

### 开发环境 -- FastAPI CLI（推荐）

```bash
# 自动发现 main.py 中的 app，启用热重载
fastapi dev

# 指定入口文件
fastapi dev main.py
```

也可在 `pyproject.toml` 中声明入口：

```toml
[tool.fastapi]
entrypoint = "app.main:app"
```

### 生产环境 -- Uvicorn

```bash
# 单进程
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 多 worker（利用多核）
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

也可以在代码中启动（仅用于调试）：

```python
import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
```

### 自动文档

启动后自动生成：
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

## Lifespan 生命周期事件（推荐方式）

使用 `asynccontextmanager` 管理启动和关闭逻辑，`yield` 之前为启动代码，之后为清理代码：

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

ml_models: dict = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- 启动阶段 ----
    ml_models["sentiment"] = load_model("sentiment-v2")
    print("Model loaded")
    yield
    # ---- 关闭阶段 ----
    ml_models.clear()
    print("Model released")

app = FastAPI(lifespan=lifespan)

@app.get("/predict")
async def predict(text: str):
    result = ml_models["sentiment"](text)
    return {"result": result}
```

### 传递状态给请求（通过 app.state）

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
import asyncpg

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await asyncpg.create_pool("postgresql://localhost/mydb")
    yield
    await app.state.pool.close()

app = FastAPI(lifespan=lifespan)

@app.get("/users/{user_id}")
async def get_user(user_id: int, request: Request):
    row = await request.app.state.pool.fetchrow(
        "SELECT * FROM users WHERE id = $1", user_id
    )
    return dict(row)
```

### 遗留方式（已弃用，仅供参考）

```python
@app.on_event("startup")
async def startup_event():
    pass  # 初始化

@app.on_event("shutdown")
async def shutdown_event():
    pass  # 清理
```

> 注意：如果传入了 `lifespan` 参数，`on_event` 注册的处理器不会被调用。两种方式不可混用。

## 配置管理（pydantic-settings）

### 安装

```bash
pip install pydantic-settings
# 如需 .env 文件支持
pip install python-dotenv
```

### 基础用法

```python
# config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "My API"
    debug: bool = False
    database_url: str
    redis_url: str = "redis://localhost:6379"
    secret_key: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )
```

对应 `.env` 文件：

```
DATABASE_URL=postgresql://user:pass@localhost/mydb
SECRET_KEY=super-secret-key-change-me
DEBUG=true
```

### 作为依赖注入（推荐，便于测试）

```python
# main.py
from functools import lru_cache
from typing import Annotated
from fastapi import Depends, FastAPI
from .config import Settings

app = FastAPI()

@lru_cache
def get_settings():
    return Settings()

@app.get("/info")
async def info(settings: Annotated[Settings, Depends(get_settings)]):
    return {
        "app_name": settings.app_name,
        "debug": settings.debug,
    }
```

`@lru_cache` 保证 `Settings()` 只实例化一次，避免每次请求都读取环境变量。

## 推荐项目结构

```
app/
├── __init__.py
├── main.py            # FastAPI 实例、lifespan、include_router
├── config.py          # Settings 类
├── dependencies.py    # 全局共享依赖
├── models/            # Pydantic 模型 / ORM 模型
│   ├── __init__.py
│   └── user.py
├── routers/           # APIRouter 模块
│   ├── __init__.py
│   ├── users.py
│   └── items.py
├── services/          # 业务逻辑层
│   └── user_service.py
└── tests/
    ├── __init__.py
    └── test_users.py
```

### 使用 APIRouter 拆分模块

```python
# app/routers/users.py
from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/")
async def list_users():
    return [{"username": "alice"}]

@router.get("/{user_id}")
async def get_user(user_id: int):
    return {"user_id": user_id}
```

```python
# app/main.py
from fastapi import FastAPI
from .routers import users, items

app = FastAPI(title="My API", version="1.0.0")
app.include_router(users.router)
app.include_router(items.router)
```

### include_router 高级参数

```python
app.include_router(
    admin.router,
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(verify_admin)],
    responses={418: {"description": "I'm a teapot"}},
)
```

## FastAPI 实例常用参数

```python
app = FastAPI(
    title="My Awesome API",
    description="API 描述，支持 Markdown",
    version="2.0.0",
    docs_url="/docs",           # None 可禁用 Swagger
    redoc_url="/redoc",         # None 可禁用 ReDoc
    openapi_url="/openapi.json",# None 可完全禁用 OpenAPI
    lifespan=lifespan,
)
```

## 常见陷阱

- **lifespan 与 on_event 不可混用**：传入 lifespan 参数后，on_event 注册的处理器会被忽略
- **忘装 pydantic-settings**：FastAPI 本身不包含 `BaseSettings`，需要 `pip install pydantic-settings`
- **Settings 未用 lru_cache**：每次请求都会重新读取环境变量和 .env 文件，影响性能
- **生产环境使用 fastapi dev**：`fastapi dev` 启用了 reload 和 debug，生产环境应使用 `fastapi run` 或 `uvicorn`
- **多 worker 下 lifespan 执行多次**：每个 worker 进程都会独立执行 lifespan，注意资源竞争（如数据库 migration 应在部署脚本中执行，而非 lifespan 中）
- **路由声明顺序**：固定路径（`/users/me`）必须放在参数路径（`/users/{user_id}`）之前

## 组合提示

- 配合 **fastapi-routing** 了解路由定义的完整参数
- 配合 **fastapi-dependencies** 理解全局依赖和 Settings 的依赖注入模式
- 配合 **fastapi-middleware** 添加 CORS、GZip 等中间件
- 配合 **fastapi-testing** 了解如何在测试中覆盖 Settings
