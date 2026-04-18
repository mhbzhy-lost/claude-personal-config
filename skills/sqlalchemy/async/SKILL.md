---
name: sqlalchemy-async
description: SQLAlchemy 2.0 asyncio 扩展的 AsyncEngine / AsyncSession 使用模式、懒加载规避与事件循环陷阱
tech_stack: [sqlalchemy]
language: [python]
capability: [orm, relational-db]
version: "SQLAlchemy 2.0"
collected_at: 2026-04-18
---

# SQLAlchemy Asyncio 扩展

> 来源：https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html

## 用途
通过 `sqlalchemy.ext.asyncio` 在 asyncio 环境下使用 Core 与 ORM，底层基于 greenlet 桥接同步 DBAPI 调用；解决阻塞式数据库访问在异步 Web 服务中的吞吐瓶颈。

## 何时使用
- FastAPI / Starlette / aiohttp 等 asyncio Web 应用需要非阻塞 DB 访问
- 使用 asyncpg、aiosqlite、aiomysql 等异步驱动
- 需要 server-side cursor 流式处理大结果集
- 混合代码库需要在 asyncio 上下文里跑部分同步 ORM 逻辑（`run_sync`）

## 安装
```bash
pip install sqlalchemy[asyncio]   # 自动带上 greenlet
```

Apple Silicon / 无预编译 wheel 的平台需要 Python dev headers 以便从源码构建 greenlet。

## 基础用法

### AsyncEngine + Core
```python
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine("postgresql+asyncpg://scott:tiger@localhost/test", echo=True)

async with engine.begin() as conn:
    await conn.run_sync(meta.create_all)          # 同步 DDL 透传
    await conn.execute(t1.insert(), [{"name": "x"}])

async with engine.connect() as conn:
    result = await conn.execute(t1.select())      # 缓冲结果
    async_result = await conn.stream(t1.select()) # 流式 AsyncResult
    async for row in async_result:
        print(row)
```

### AsyncSession + ORM（2.0 风格）
```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, selectinload

class Base(AsyncAttrs, DeclarativeBase): pass

async_session = async_sessionmaker(engine, expire_on_commit=False)

async with async_session() as session:
    async with session.begin():
        session.add_all([A(bs=[B(), B()], data="a1")])

    # 关系字段必须显式 eager-load
    stmt = select(A).options(selectinload(A.bs))
    result = await session.scalars(stmt)
    for a in result:
        for b in a.bs:
            print(b)

    # 对未 eager-load 的关系用 AsyncAttrs
    for b in await a.awaitable_attrs.bs:
        print(b)
```

## 关键 API（摘要）

| API | 用途 |
|-----|------|
| `create_async_engine(url, **kw)` | 创建 AsyncEngine；`poolclass=NullPool` 用于跨事件循环共享 |
| `async_sessionmaker(engine, expire_on_commit=False)` | AsyncSession 工厂；推荐关闭 expire_on_commit |
| `AsyncSession.execute / scalars` | 2.0 风格执行，返回缓冲结果 |
| `AsyncSession.stream / stream_scalars` | 返回 `AsyncResult`，支持 `async for` |
| `AsyncSession.run_sync(fn)` | 在 greenlet 下跑同步 ORM 代码（lazy load 可用） |
| `AsyncSession.refresh(obj, ["attr"])` | 显式加载懒属性 |
| `AsyncAttrs.awaitable_attrs.<rel>` | 以 awaitable 方式访问关系字段 |
| `AsyncConnection.run_sync(fn)` | 跑 `metadata.create_all` / `inspect(conn)` 等同步 API |
| `async_scoped_session(factory, scopefunc=current_task)` | 任务级 scoped session |
| `AdaptedConnection.run_async(lambda c: ...)` | 在同步事件回调里调用 awaitable 驱动方法 |

## 注意事项

- **AsyncSession 不是线程/任务安全的**：并发任务必须各自创建 session 实例。
- **禁止隐式 I/O**：lazy load、访问过期属性会触发同步 I/O 并在 asyncio 下报错。对策：`selectinload` 等 eager loading、`expire_on_commit=False`、`AsyncAttrs`、`session.refresh(obj, [...])`。
- **多事件循环**：同一个 AsyncEngine 不能被多个 loop 共享连接池。跨 loop 前调用 `await engine.dispose()`，或直接 `poolclass=NullPool`。
- **async_scoped_session**：务必在最外层 await 处调 `await AsyncScopedSession.remove()`，否则任务残留导致内存泄漏。
- **事件回调仍是同步的**：在 `engine.sync_engine` 上注册 `connect` 等事件；若需调用 awaitable-only 驱动方法，用 `dbapi_connection.run_async(...)`。
- **Schema 反射**：`inspect()` 需通过 `await conn.run_sync(use_inspector)` 调用。

## 组合提示
- 连接池参数、URL、dispose 语义见 `sqlalchemy-pooling`
- 与 FastAPI 组合时常用 `async_scoped_session(scopefunc=current_task)` + 请求级依赖注入
- 驱动选型：Postgres 首选 `asyncpg`，SQLite 用 `aiosqlite`，MySQL 用 `asyncmy` / `aiomysql`
