---
name: fastapi-orm-integration
description: FastAPI 集成 SQL 数据库的同步（SQLModel）与异步（SQLAlchemy asyncio）模式
tech_stack: [fastapi, sqlmodel, sqlalchemy]
language: [python]
capability: [orm, relational-db]
version: "sqlmodel unversioned; sqlalchemy 2.0"
collected_at: 2026-04-18
---

# FastAPI ORM 集成（SQLModel / SQLAlchemy 异步）

> 来源：https://fastapi.tiangolo.com/tutorial/sql-databases/ 、https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html

## 用途
在 FastAPI 中持久化关系型数据：同步场景用 SQLModel（Pydantic + SQLAlchemy 合一），`async def` 端点需要非阻塞 I/O 时用 SQLAlchemy asyncio。

## 何时使用
- CRUD 业务，需要 Pydantic 校验与 ORM 一体：选 SQLModel
- 高并发 async 路由、使用 asyncpg/aiomysql：选 SQLAlchemy asyncio
- 支持的数据库：PostgreSQL、MySQL、SQLite、Oracle、SQL Server

## 基础用法

### SQLModel（同步）
```python
from typing import Annotated
from fastapi import Depends, FastAPI, HTTPException
from sqlmodel import Field, Session, SQLModel, create_engine, select

class Hero(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    secret_name: str

engine = create_engine("sqlite:///db.db", connect_args={"check_same_thread": False})

def get_session():
    with Session(engine) as session:
        yield session
SessionDep = Annotated[Session, Depends(get_session)]

app = FastAPI()

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)

@app.post("/heroes/")
def create_hero(hero: Hero, session: SessionDep) -> Hero:
    session.add(hero); session.commit(); session.refresh(hero)
    return hero
```

### SQLAlchemy asyncio
```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

engine = create_async_engine("postgresql+asyncpg://u:p@host/db")
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

### 多模型分层（推荐）
分离 `HeroBase`（共享字段）/ `Hero`（table=True）/ `HeroPublic`（返回）/ `HeroCreate` / `HeroUpdate`，避免客户端设置 `id`、暴露敏感字段。更新用 `hero.model_dump(exclude_unset=True)` + `hero_db.sqlmodel_update(data)`。

## 关键 API
- `Field(primary_key=True, index=True, default=None)`：SQLModel 字段配置
- `SQLModel.metadata.create_all(engine)`：建表
- `session.exec(select(Model).offset().limit()).all()`：查询
- `session.get(Model, pk)` / `add` / `commit` / `refresh` / `delete`
- `create_async_engine(url)` / `AsyncSession` / `expire_on_commit=False`
- `selectinload(Model.rel)`：异步场景预加载关联，避免隐式 IO
- `AsyncAttrs` mixin：`await obj.awaitable_attrs.rel` 惰性访问

## 注意事项
- **SQLite + FastAPI**：必须 `connect_args={"check_same_thread": False}`，请求可能跨线程
- **AsyncSession 非线程/协程安全**：不能在多个并发 task 中共享同一 session
- **异步避免隐式 IO**：设 `expire_on_commit=False`；所有关系用 `selectinload()` 预加载；否则访问属性会触发 greenlet 同步 IO 崩溃
- **greenlet 安装**：Apple M1 等架构需 `pip install sqlalchemy[asyncio]`
- **跨事件循环复用 engine**：调用 `engine.dispose()` 或配置 `NullPool`
- **事件监听**：注册到 `engine.sync_engine` 或 `Session` 类，handler 必须同步

## 组合提示
配合 Alembic 做迁移；异步模式配合 `asyncpg`/`aiomysql` 驱动；对外响应用独立的 Pydantic `response_model` 防止泄漏 ORM 内部字段。
