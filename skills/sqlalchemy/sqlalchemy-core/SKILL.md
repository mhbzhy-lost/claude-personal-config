---
name: sqlalchemy-core
description: "SQLAlchemy 2.0 引擎创建、连接池、Session 管理与事务控制"
tech_stack: [sqlalchemy, backend]
language: [python]
capability: [orm, relational-db]
---

# SQLAlchemy Core（引擎与会话）

> 来源：https://docs.sqlalchemy.org/en/20/core/engines.html
> 版本基准：SQLAlchemy 2.0+

## 用途

提供数据库连接的基础设施层：Engine 负责维护连接池并生成连接，Session 负责在连接之上管理 ORM 对象的生命周期与事务边界。

## 何时使用

- 项目初始化时配置数据库连接
- 需要调优连接池参数（高并发、长连接、云数据库超时）
- 需要精确控制事务边界（commit / rollback / savepoint）
- 使用 asyncio 框架（FastAPI、Starlette）需要异步数据库访问

## 引擎创建

### 同步引擎

```python
from sqlalchemy import create_engine

# 基本用法
engine = create_engine("postgresql+psycopg2://user:pass@localhost:5432/mydb")

# 完整配置（生产推荐）
engine = create_engine(
    "postgresql+psycopg2://user:pass@localhost:5432/mydb",
    pool_size=10,          # 连接池常驻连接数，默认 5
    max_overflow=20,       # 超出 pool_size 后允许的额外连接数，默认 10
    pool_timeout=30,       # 获取连接的最大等待秒数，默认 30
    pool_recycle=1800,     # 连接最大存活秒数（MySQL 推荐 < wait_timeout）
    pool_pre_ping=True,    # 每次取连接前发 SELECT 1 检测存活（推荐开启）
    echo=False,            # True 时打印所有 SQL（仅调试用）
)
```

### 异步引擎

```python
from sqlalchemy.ext.asyncio import create_async_engine

# asyncpg (PostgreSQL)
async_engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost:5432/mydb",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

# aiosqlite (SQLite，仅开发/测试)
async_engine = create_async_engine("sqlite+aiosqlite:///./test.db")
```

### 常见数据库 URL 格式

```python
# PostgreSQL (psycopg2 同步 / asyncpg 异步)
"postgresql+psycopg2://user:pass@host:5432/db"
"postgresql+asyncpg://user:pass@host:5432/db"

# MySQL (pymysql 同步 / aiomysql 异步)
"mysql+pymysql://user:pass@host:3306/db?charset=utf8mb4"
"mysql+aiomysql://user:pass@host:3306/db?charset=utf8mb4"

# SQLite
"sqlite:///./app.db"          # 相对路径
"sqlite:////tmp/app.db"       # 绝对路径
"sqlite+aiosqlite:///./app.db"  # 异步
```

## 连接池配置详解

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `pool_size` | 5 | 常驻连接数，QueuePool 专用 |
| `max_overflow` | 10 | 溢出连接数，总连接上限 = pool_size + max_overflow |
| `pool_timeout` | 30 | 等待空闲连接的超时秒数 |
| `pool_recycle` | -1 | 连接最大存活秒数，-1 为不回收 |
| `pool_pre_ping` | False | 取连接前检测连接是否存活 |
| `poolclass` | QueuePool | 可选 NullPool（禁用池）、StaticPool（单连接） |

```python
from sqlalchemy.pool import NullPool

# 无连接池（适用于 serverless / 短生命周期场景）
engine = create_engine(url, poolclass=NullPool)
```

## Session 与 sessionmaker

### 同步 Session

```python
from sqlalchemy.orm import Session, sessionmaker

# 方式一：sessionmaker 工厂（推荐）
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

# 使用 Session
with SessionLocal() as session:
    user = session.get(User, 1)
    user.name = "new_name"
    session.commit()

# 方式二：直接实例化
with Session(engine) as session:
    session.add(User(name="alice"))
    session.commit()
```

### 异步 Session

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

async_session_factory = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,  # 异步场景必须设为 False（避免惰性加载触发同步 IO）
)

async with async_session_factory() as session:
    result = await session.execute(select(User).where(User.id == 1))
    user = result.scalar_one()
```

### FastAPI 依赖注入

```python
# 同步
def get_session():
    with SessionLocal() as session:
        yield session

# 异步
async def get_async_session():
    async with async_session_factory() as session:
        yield session

# 路由中使用
@app.get("/users/{user_id}")
async def read_user(user_id: int, session: AsyncSession = Depends(get_async_session)):
    user = await session.get(User, user_id)
    return user
```

## 事务管理

### 自动事务（autobegin）

SQLAlchemy 2.0 中 Session 默认 `autobegin=True`——首次执行 SQL 时自动开启事务，直到调用 `commit()` 或 `rollback()`。

```python
with SessionLocal() as session:
    session.add(User(name="bob"))
    session.commit()   # 提交事务
    # commit 后自动开始新事务（autobegin）
```

### 显式事务边界（推荐）

```python
# begin() 上下文管理器：正常退出自动 commit，异常自动 rollback
with SessionLocal.begin() as session:
    session.add(User(name="alice"))
    session.add(User(name="bob"))
    # 退出 with 块时自动 commit
    # 如果抛异常则自动 rollback
```

### Savepoint（嵌套事务）

```python
with SessionLocal() as session:
    session.add(User(name="alice"))

    try:
        with session.begin_nested():  # SAVEPOINT
            session.add(User(name="duplicate"))  # 可能违反唯一约束
    except IntegrityError:
        pass  # savepoint 已回滚，外层事务不受影响

    session.commit()  # alice 仍会被提交
```

### 异步事务

```python
async with async_session_factory() as session:
    async with session.begin():
        session.add(User(name="alice"))
        # 正常退出自动 commit，异常自动 rollback
```

## 关键 API 摘要

| API | 说明 |
|-----|------|
| `create_engine(url, **kwargs)` | 创建同步引擎 |
| `create_async_engine(url, **kwargs)` | 创建异步引擎 |
| `sessionmaker(bind=engine)` | 同步 Session 工厂 |
| `async_sessionmaker(bind=engine)` | 异步 Session 工厂 |
| `session.commit()` | 提交当前事务 |
| `session.rollback()` | 回滚当前事务 |
| `session.begin()` | 显式开始事务（上下文管理器） |
| `session.begin_nested()` | 创建 SAVEPOINT |
| `session.get(Model, pk)` | 按主键查询（优先从 identity map 取） |
| `session.execute(stmt)` | 执行 SQL 语句 |
| `session.flush()` | 将挂起变更写入数据库（不提交） |
| `session.close()` | 关闭 Session 并释放连接 |

## 1.x vs 2.0 关键变更

| 1.x 旧写法 | 2.0 新写法 | 说明 |
|-------------|-----------|------|
| `session.query(User).all()` | `session.execute(select(User)).scalars().all()` | 查询 API 全面切换到 select() |
| `engine.execute(text)` | `with engine.connect() as conn: conn.execute(text)` | Engine 不再直接执行 SQL |
| `Session(autocommit=True)` | 已移除 | 2.0 中 autocommit 模式被删除 |
| `session.query(User).get(1)` | `session.get(User, 1)` | get() 移到 Session 上 |

## 常见陷阱

- **expire_on_commit 导致延迟加载错误**：异步 Session 中如果 `expire_on_commit=True`（默认），commit 后访问属性会触发同步 IO 并报错。异步场景务必设为 `False`。
- **pool_recycle 不设导致 MySQL 断连**：MySQL 默认 `wait_timeout=28800`（8 小时），若应用空闲超过该时间，连接池中的连接会被服务端断开。设置 `pool_recycle=3600` 可预防。
- **NullPool 与 pool_size 冲突**：使用 `poolclass=NullPool` 时不要传 `pool_size`，否则会报警告。
- **忘记 commit**：`session.add()` 后不调用 `commit()` 或未使用 `begin()` 上下文管理器，数据不会持久化。
- **多线程共享 Session**：Session 不是线程安全的，每个线程 / 每个请求应使用独立 Session。异步场景同理：每个 asyncio Task 一个 AsyncSession。
- **SQLite 异步限制**：aiosqlite 的并发能力受限于 SQLite 自身的写锁机制，不适合生产高并发。

## 组合提示

- 与 **sqlalchemy-orm** 搭配定义模型与查询
- 与 **sqlalchemy-migrations** (Alembic) 搭配管理数据库迁移
- 与 **sqlmodel-core** 搭配在 FastAPI 项目中使用
- 与 **sqlalchemy-advanced** 搭配使用事件监听和性能优化
