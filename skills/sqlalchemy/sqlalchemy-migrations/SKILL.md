---
name: sqlalchemy-migrations
description: "Alembic 数据库迁移：初始化、自动生成、多头合并与异步引擎配合"
tech_stack: [sqlalchemy]
---

# SQLAlchemy Migrations（Alembic）

> 来源：https://alembic.sqlalchemy.org/en/latest/tutorial.html
> 版本基准：Alembic 1.13+、SQLAlchemy 2.0+

## 用途

使用 Alembic 管理数据库 schema 的版本化迁移——自动检测模型变更生成迁移脚本，支持升级/降级、数据迁移和多分支合并。

## 何时使用

- 项目首次建表或模型结构变更后需要同步数据库
- 多人协作时需要可追踪、可回溯的 schema 变更历史
- 需要在迁移中执行数据转换（DDL + DML）
- 使用异步数据库驱动（asyncpg / aiomysql）时需要适配 Alembic

## 初始化

### 同步项目

```bash
# 安装
pip install alembic

# 初始化（生成 alembic/ 目录和 alembic.ini）
alembic init alembic
```

### 异步项目

```bash
# 使用 async 模板初始化
alembic init -t async alembic
```

### 目录结构

```
project/
├── alembic.ini              # 配置文件
├── alembic/
│   ├── env.py               # 迁移运行环境（最关键）
│   ├── script.py.mako       # 迁移脚本模板
│   └── versions/            # 迁移脚本存放目录
│       ├── 001_create_users.py
│       └── 002_add_email.py
└── app/
    └── models.py            # SQLAlchemy 模型
```

## 配置

### alembic.ini

```ini
[alembic]
script_location = alembic
# 数据库 URL（也可在 env.py 中动态设置）
sqlalchemy.url = postgresql+psycopg2://user:pass@localhost/mydb
```

### env.py（同步版核心配置）

```python
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# 加载 alembic.ini 中的日志配置
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 关键：导入所有模型，确保 Base.metadata 包含所有表
from app.models import Base  # noqa: E402
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """生成 SQL 脚本模式（不连接数据库）"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """在线模式（连接数据库执行）"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### env.py（异步版核心配置）

```python
import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from app.models import Base  # noqa: E402
target_metadata = Base.metadata


def do_run_migrations(connection) -> None:
    """同步迁移逻辑，被 run_sync 调用"""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """异步迁移入口"""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    # offline 模式同样适用（不需要异步）
    run_migrations_offline()
else:
    run_migrations_online()
```

### 从环境变量动态设置 URL

```python
# env.py 中
import os

def run_migrations_online() -> None:
    url = os.environ.get("DATABASE_URL")
    if url:
        config.set_main_option("sqlalchemy.url", url)
    # ... 后续逻辑
```

## 自动生成迁移

### 生成迁移脚本

```bash
# 自动检测模型变更并生成迁移
alembic revision --autogenerate -m "add users table"

# 生成空迁移（手动编写）
alembic revision -m "custom data migration"
```

### 自动生成能力范围

| 能检测到的变更 | 不能检测到的变更 |
|---------------|-----------------|
| 新增/删除表 | 表名重命名 |
| 新增/删除列 | 列名重命名 |
| 列类型变更 | 约束名称变更 |
| 可空性变更 | 存储过程 / 触发器 |
| 外键/索引/唯一约束变更 | 特定数据库类型的细微差异 |

> 每次 autogenerate 后必须人工审查生成的脚本！

### 生成的迁移脚本示例

```python
"""add users table

Revision ID: a1b2c3d4e5f6
Revises: (None)
Create Date: 2024-01-15 10:30:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=100), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_name", "users", ["name"])


def downgrade() -> None:
    op.drop_index("ix_users_name", table_name="users")
    op.drop_table("users")
```

## 执行迁移

```bash
# 升级到最新
alembic upgrade head

# 升级 N 步
alembic upgrade +1

# 降级 N 步
alembic downgrade -1

# 降级到初始状态
alembic downgrade base

# 查看当前版本
alembic current

# 查看迁移历史
alembic history --verbose

# 生成 SQL 而不执行（离线模式）
alembic upgrade head --sql > migration.sql
```

## 数据迁移（DDL + DML）

在迁移脚本中混合 schema 变更和数据操作：

```python
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column


def upgrade() -> None:
    # DDL：新增列
    op.add_column("users", sa.Column("role", sa.String(20), server_default="member"))

    # DML：迁移已有数据
    users_table = table("users", column("id", sa.Integer), column("role", sa.String))
    op.execute(users_table.update().where(users_table.c.id <= 10).values(role="admin"))


def downgrade() -> None:
    op.drop_column("users", "role")
```

### 批量数据插入

```python
from alembic import op
from sqlalchemy.sql import table, column
import sqlalchemy as sa


def upgrade() -> None:
    # 使用 Alembic 的 bulk_insert（兼容离线模式）
    roles_table = table("roles", column("id", sa.Integer), column("name", sa.String))
    op.bulk_insert(roles_table, [
        {"id": 1, "name": "admin"},
        {"id": 2, "name": "editor"},
        {"id": 3, "name": "viewer"},
    ])
```

## 多头迁移与合并

当多人同时基于同一版本创建迁移时，会产生"多头"（multiple heads）：

```bash
# 查看是否有多头
alembic heads

# 合并多头
alembic merge -m "merge heads" head1_rev head2_rev

# 或直接合并所有头
alembic merge heads -m "merge all heads"
```

合并后生成的迁移脚本不包含任何实际变更，仅将两个分支连接为一条线。

### 预防多头

```bash
# CI 中检查是否只有一个 head
alembic heads | wc -l  # 应输出 1
```

## 手动迁移脚本模式

适用于 autogenerate 无法处理的场景：

```python
"""rename column email to email_address"""

def upgrade() -> None:
    # 重命名列（autogenerate 检测不到）
    op.alter_column("users", "email", new_column_name="email_address")

def downgrade() -> None:
    op.alter_column("users", "email_address", new_column_name="email")
```

## 关键 op 操作速查

| 操作 | API |
|------|-----|
| 创建表 | `op.create_table(name, *columns)` |
| 删除表 | `op.drop_table(name)` |
| 添加列 | `op.add_column(table, Column(...))` |
| 删除列 | `op.drop_column(table, column_name)` |
| 改列类型 | `op.alter_column(table, col, type_=NewType)` |
| 重命名列 | `op.alter_column(table, col, new_column_name=...)` |
| 创建索引 | `op.create_index(name, table, columns)` |
| 删除索引 | `op.drop_index(name, table_name=table)` |
| 创建外键 | `op.create_foreign_key(name, src, dst, ...)` |
| 创建唯一约束 | `op.create_unique_constraint(name, table, columns)` |
| 执行原生 SQL | `op.execute("ALTER TABLE ...")` |
| 批量插入 | `op.bulk_insert(table, rows)` |

## 常见陷阱

- **忘记导入模型**：`env.py` 中 `target_metadata = Base.metadata` 前必须导入所有模型模块，否则 autogenerate 检测不到任何表。常见做法是在 `models/__init__.py` 中统一 re-export。
- **MySQL 无事务 DDL**：MySQL 的 DDL 语句（CREATE TABLE 等）会隐式提交，无法在一个事务中回滚。迁移失败后可能处于半完成状态，需手动修复。
- **autogenerate 不检测列重命名**：Alembic 会将列重命名理解为"删除旧列 + 新增新列"，导致数据丢失。必须手动编写 `alter_column`。
- **异步驱动 URL 配置**：alembic.ini 中使用 `postgresql+asyncpg://` 时，env.py 必须使用 `async_engine_from_config` 和 `run_sync` 模式，否则会报错。
- **多头未合并**：多人协作时如果不及时 merge heads，`alembic upgrade head` 会报 "Multiple head revisions" 错误。CI 中应检测 head 数量。
- **downgrade 未维护**：只写 upgrade 不写 downgrade 会导致无法回退。生产环境部署前务必测试 upgrade + downgrade 往返。
- **数据迁移中直接用 ORM 模型**：不要在迁移脚本中 import ORM 模型类，因为模型类会随代码变化，导致旧迁移脚本失效。应使用 `sa.table()` / `sa.column()` 构建轻量级表引用。

## 组合提示

- 与 **sqlalchemy-core** 搭配配置引擎（特别是异步引擎的 env.py 适配）
- 与 **sqlalchemy-orm** 搭配定义模型并自动生成迁移
- 与 **sqlmodel-core** 搭配使用时，`target_metadata = SQLModel.metadata`
