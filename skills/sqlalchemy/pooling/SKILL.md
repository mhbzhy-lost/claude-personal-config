---
name: sqlalchemy-pooling
description: SQLAlchemy 2.0 Engine 创建、连接池类型与参数、断连恢复与 URL 构造实战
tech_stack: [sqlalchemy]
language: [python]
capability: [orm, relational-db]
version: "SQLAlchemy 2.0.49"
collected_at: 2026-04-18
---

# SQLAlchemy Engine 与连接池

> 来源：https://docs.sqlalchemy.org/en/20/core/pooling.html, /core/engines.html

## 用途
`create_engine()` 返回的 Engine 封装 Dialect + Pool，负责连接复用、并发上限管理与断连恢复。连接池在服务端 Web 场景下避免了每次请求新建 TCP/认证开销。

## 何时使用
- 所有 SQLAlchemy 应用启动阶段的 Engine 初始化
- 需要控制数据库并发连接上限（`pool_size` + `max_overflow`）
- 处理 MySQL 8 小时空闲断连、云数据库中间件定时踢连接
- 在 fork 后的子进程、多事件循环中重置连接池

## 基础用法

```python
from sqlalchemy import create_engine

engine = create_engine(
    "postgresql+psycopg2://me@localhost/mydb",
    pool_size=20,
    max_overflow=0,
    pool_pre_ping=True,      # 每次 checkout 前 ping，自动剔除死连接
    pool_recycle=3600,       # 1 小时强制回收，避开 MySQL idle timeout
    echo=False,
)
```

Engine 懒初始化：直到 `engine.connect()` / `engine.begin()` 才真正建连。

## 关键参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `pool_size` | 5 | 保持的常驻连接数 |
| `max_overflow` | 10 | 允许超出 pool_size 的临时连接数；设 0 表示硬上限 |
| `pool_timeout` | 30 | 等待可用连接的秒数 |
| `pool_recycle` | -1 | N 秒后强制回收连接，避开 server idle timeout |
| `pool_pre_ping` | False | checkout 前发 `SELECT 1`，悲观式断连检测 |
| `pool_reset_on_return` | `"rollback"` | 归还时动作；autocommit 场景可设 `None` / `"commit"` |
| `poolclass` | QueuePool | 替换池实现（`NullPool`、`StaticPool` 等） |
| `isolation_level` | 驱动默认 | `"SERIALIZABLE"` / `"READ COMMITTED"` / `"AUTOCOMMIT"` |
| `connect_args` | `{}` | 透传给 DBAPI 的连接参数 |
| `echo` | False | `True` 打印 SQL；`"debug"` 连结果行也打 |
| `hide_parameters` | False | 日志中遮蔽 bound params |

## Pool 类型

| Pool | 语义 |
|------|------|
| `QueuePool` | 默认；带上限的 FIFO |
| `NullPool` | 不池化，每次新建/关闭；适合串行脚本、跨事件循环共享 |
| `SingletonThreadPool` | 每线程一条；SQLite 默认用于内存库 |
| `StaticPool` | 整个 Engine 共用一条连接；测试 / 内存 SQLite |
| `AssertionPool` | 只允许一条 checked-out，调试用 |

## URL 构造

标准格式 `dialect+driver://user:password@host:port/database`。

```python
# 密码含特殊字符——推荐 URL.create 绕过转义
from sqlalchemy import URL, create_engine

url = URL.create(
    "postgresql+pg8000",
    username="dbuser",
    password="kx@jj5/g",
    host="pghost10",
    database="appdb",
)
engine = create_engine(url)
```

常见后端：
```python
create_engine("postgresql+psycopg2://scott:tiger@localhost/mydb")
create_engine("mysql+pymysql://user:pass@host/test?charset=utf8mb4")
create_engine("sqlite:///foo.db")                  # 相对
create_engine("sqlite:////abs/path/foo.db")        # 绝对
create_engine("sqlite://")                         # 内存
create_engine("oracle+oracledb://scott:tiger@host:1521/?service_name=freepdb1")
create_engine("mssql+pyodbc://scott:tiger@mydsn")
```

## 断连恢复两种策略

- **悲观式**：`pool_pre_ping=True`，checkout 前探测，开销一次轻量 SELECT。
- **乐观式**：不配置 pre_ping；真正操作时遇到 disconnect 错误，SQLAlchemy 标记整个池失效并自动重连。配合 `pool_recycle` 在固定时长主动回收。

## 连接定制

```python
from sqlalchemy import event

@event.listens_for(engine, "connect")
def on_connect(dbapi_connection, connection_record):
    cur = dbapi_connection.cursor()
    cur.execute("SET TIME ZONE 'UTC'")
    cur.close()

# 动态鉴权 token（如 AWS RDS IAM）——改 cparams
@event.listens_for(engine, "do_connect")
def provide_token(dialect, conn_rec, cargs, cparams):
    cparams["password"] = get_rds_auth_token()
```

## 日志

```python
import logging
logging.basicConfig()
logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)
# sqlalchemy.pool / sqlalchemy.dialects / sqlalchemy.orm 各有独立 logger
```

请求级追踪用 `execution_options(logging_token="req-123")`，日志里会带 `[req-123]`。

## 注意事项

- **Fork 不共享池**：在子进程入口调 `engine.dispose(close=False)`，让子进程用全新连接；否则父子共享 socket 会乱序崩溃。
- **跨 asyncio event loop 不共享池**：重用前 `await engine.dispose()`，或 `poolclass=NullPool`。
- **MySQL `wait_timeout` 默认 8 小时**：务必配 `pool_recycle`（如 3600）。
- **密码里的 `@ / : ?` 必须 URL 编码**，或改用 `URL.create()`。
- **2.0.49 修复**：连接之间曾共享可变集合，升级到 ≥ 2.0.49。

## 组合提示
- 异步场景参数与 dispose 语义见 `sqlalchemy-async`
- `pool_reset_on_return=None` + `isolation_level="AUTOCOMMIT"` 常一起用于只读查询 Engine
- 生产部署通常 `pool_pre_ping=True` + `pool_recycle=3600` 配 `max_overflow=0` 以严控连接数
