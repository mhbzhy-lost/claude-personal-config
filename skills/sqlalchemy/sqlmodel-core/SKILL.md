---
name: sqlmodel-core
description: "SQLModel 模型定义、CRUD 操作与 FastAPI 集成"
tech_stack: [sqlalchemy, backend]
language: [python]
capability: [orm, api-design]
---

# SQLModel Core（模型与 FastAPI 集成）

> 来源：https://sqlmodel.tiangolo.com
> 版本基准：SQLModel 0.0.22+、SQLAlchemy 2.0+、FastAPI 0.100+

## 用途

SQLModel 统一 SQLAlchemy 的 ORM 能力和 Pydantic 的数据验证能力——用一个类同时定义数据库表结构和 API 请求/响应模型，避免重复定义。

## 何时使用

- FastAPI 项目中需要数据库 ORM
- 希望模型类同时支持数据库映射和 Pydantic 验证
- 需要简洁的 CRUD 模式而不需要 SQLAlchemy 的全部高级功能
- 团队偏好"约定大于配置"风格

## 模型定义

### 基础表模型

```python
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel


# table=True 表示这是一个数据库表模型
class User(SQLModel, table=True):
    # 主键：id 为 Optional 是因为创建时由数据库生成
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=50, index=True)
    email: str = Field(max_length=100, unique=True)
    age: int | None = Field(default=None, ge=0, le=150)
    is_active: bool = Field(default=True)
    created_at: datetime | None = Field(default=None)
```

### 纯数据模型（无 table=True）

```python
# 不映射到数据库表，仅用于请求/响应验证（等同于 Pydantic BaseModel）
class UserCreate(SQLModel):
    name: str = Field(max_length=50)
    email: str = Field(max_length=100)
    age: int | None = Field(default=None, ge=0, le=150)


class UserUpdate(SQLModel):
    name: str | None = None
    email: str | None = None
    age: int | None = None


class UserPublic(SQLModel):
    id: int
    name: str
    email: str
    is_active: bool
```

### Field 常用参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `primary_key` | 主键 | `Field(primary_key=True)` |
| `default` | Python 默认值 | `Field(default=True)` |
| `index` | 创建索引 | `Field(index=True)` |
| `unique` | 唯一约束 | `Field(unique=True)` |
| `nullable` | 允许 NULL（通常由类型推导） | `Field(nullable=True)` |
| `max_length` | 字符串最大长度 | `Field(max_length=100)` |
| `ge` / `le` / `gt` / `lt` | 数值范围验证 | `Field(ge=0, le=100)` |
| `regex` | 正则验证 | `Field(regex=r"^[a-z]+$")` |
| `foreign_key` | 外键 | `Field(foreign_key="teams.id")` |
| `sa_column` | 传入原始 SQLAlchemy Column | `Field(sa_column=Column(Text))` |

## 关系定义

### 一对多

```python
from sqlmodel import Field, Relationship, SQLModel


class Team(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)

    # 一个 Team 有多个 Hero
    heroes: list["Hero"] = Relationship(back_populates="team")


class Hero(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=50, index=True)
    team_id: int | None = Field(default=None, foreign_key="team.id")

    # 多对一
    team: Team | None = Relationship(back_populates="heroes")
```

### 多对多（link_model）

```python
class HeroTeamLink(SQLModel, table=True):
    """关联表"""
    hero_id: int | None = Field(
        default=None, foreign_key="hero.id", primary_key=True
    )
    team_id: int | None = Field(
        default=None, foreign_key="team.id", primary_key=True
    )
    # 可添加额外字段
    is_captain: bool = Field(default=False)


class Hero(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=50)

    teams: list["Team"] = Relationship(
        back_populates="heroes", link_model=HeroTeamLink
    )


class Team(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)

    heroes: list["Hero"] = Relationship(
        back_populates="teams", link_model=HeroTeamLink
    )
```

## CRUD 操作模式

### Create

```python
from sqlmodel import Session

def create_hero(session: Session, hero_create: HeroCreate) -> Hero:
    # 从请求模型转为数据库模型
    hero = Hero.model_validate(hero_create)
    session.add(hero)
    session.commit()
    session.refresh(hero)  # 刷新以获取数据库生成的字段（id 等）
    return hero
```

### Read

```python
from sqlmodel import Session, select

def get_hero(session: Session, hero_id: int) -> Hero | None:
    return session.get(Hero, hero_id)

def list_heroes(session: Session, offset: int = 0, limit: int = 20) -> list[Hero]:
    statement = select(Hero).offset(offset).limit(limit)
    return session.exec(statement).all()

def search_heroes(session: Session, name: str) -> list[Hero]:
    statement = select(Hero).where(Hero.name.contains(name))
    return session.exec(statement).all()
```

### Update

```python
def update_hero(session: Session, hero_id: int, hero_update: HeroUpdate) -> Hero:
    hero = session.get(Hero, hero_id)
    if not hero:
        raise ValueError("Hero not found")

    # model_dump(exclude_unset=True) 只更新客户端实际传入的字段
    update_data = hero_update.model_dump(exclude_unset=True)
    hero.sqlmodel_update(update_data)

    session.add(hero)
    session.commit()
    session.refresh(hero)
    return hero
```

### Delete

```python
def delete_hero(session: Session, hero_id: int) -> bool:
    hero = session.get(Hero, hero_id)
    if not hero:
        return False
    session.delete(hero)
    session.commit()
    return True
```

## FastAPI 集成

### Session 依赖注入

```python
from fastapi import Depends, FastAPI
from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = "sqlite:///./database.db"
engine = create_engine(DATABASE_URL, echo=False)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


app = FastAPI()


@app.on_event("startup")
def on_startup():
    create_db_and_tables()
```

### 完整 CRUD 路由

```python
from fastapi import Depends, FastAPI, HTTPException, Query

@app.post("/heroes/", response_model=HeroPublic)
def create_hero(hero: HeroCreate, session: Session = Depends(get_session)):
    db_hero = Hero.model_validate(hero)
    session.add(db_hero)
    session.commit()
    session.refresh(db_hero)
    return db_hero


@app.get("/heroes/", response_model=list[HeroPublic])
def read_heroes(
    offset: int = 0,
    limit: int = Query(default=20, le=100),
    session: Session = Depends(get_session),
):
    heroes = session.exec(select(Hero).offset(offset).limit(limit)).all()
    return heroes


@app.get("/heroes/{hero_id}", response_model=HeroPublic)
def read_hero(hero_id: int, session: Session = Depends(get_session)):
    hero = session.get(Hero, hero_id)
    if not hero:
        raise HTTPException(status_code=404, detail="Hero not found")
    return hero


@app.patch("/heroes/{hero_id}", response_model=HeroPublic)
def update_hero(
    hero_id: int, hero: HeroUpdate, session: Session = Depends(get_session)
):
    db_hero = session.get(Hero, hero_id)
    if not db_hero:
        raise HTTPException(status_code=404, detail="Hero not found")
    hero_data = hero.model_dump(exclude_unset=True)
    db_hero.sqlmodel_update(hero_data)
    session.add(db_hero)
    session.commit()
    session.refresh(db_hero)
    return db_hero


@app.delete("/heroes/{hero_id}")
def delete_hero(hero_id: int, session: Session = Depends(get_session)):
    hero = session.get(Hero, hero_id)
    if not hero:
        raise HTTPException(status_code=404, detail="Hero not found")
    session.delete(hero)
    session.commit()
    return {"ok": True}
```

### 分离请求/响应/数据库模型（推荐模式）

```python
# 基础共享字段
class HeroBase(SQLModel):
    name: str = Field(max_length=50, index=True)
    age: int | None = Field(default=None, ge=0)

# 创建请求体
class HeroCreate(HeroBase):
    secret_name: str = Field(max_length=100)

# 数据库表模型
class Hero(HeroBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    secret_name: str = Field(max_length=100)

# 响应模型（不包含 secret_name）
class HeroPublic(HeroBase):
    id: int

# 更新请求体（所有字段可选）
class HeroUpdate(SQLModel):
    name: str | None = None
    age: int | None = None
```

## 与纯 SQLAlchemy 的互操作

### 混合使用

```python
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlmodel import SQLModel, Field

# SQLModel 模型
class Hero(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str

# 纯 SQLAlchemy 模型（可以在同一项目中共存）
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    action: Mapped[str]
```

### Metadata 共享

```python
# SQLModel 使用自己的 metadata
from sqlmodel import SQLModel
# SQLModel.metadata 包含所有 SQLModel table=True 的表

# 如果需要 Alembic 同时管理两者，需要合并 metadata
from sqlalchemy import MetaData
combined_metadata = MetaData()
# 或让两者使用同一个 Base
```

### 何时用 SQLModel 何时用纯 SQLAlchemy

| 场景 | 推荐 |
|------|------|
| FastAPI CRUD 接口 | SQLModel |
| 简单模型 + Pydantic 验证 | SQLModel |
| 复杂关系（多级继承、多态） | 纯 SQLAlchemy |
| 混合属性 / 事件监听 | 纯 SQLAlchemy |
| 已有 SQLAlchemy 项目 | 渐进式引入 SQLModel |

## 关键 API 摘要

| API | 说明 |
|-----|------|
| `SQLModel` | 基类（table=True 为表模型，否则为纯数据模型） |
| `Field(...)` | 定义字段约束和元数据 |
| `Relationship(...)` | 定义关系 |
| `session.exec(statement)` | SQLModel 专用查询执行（返回类型更友好） |
| `session.get(Model, pk)` | 按主键查询 |
| `model.model_validate(data)` | 从 dict/其他模型创建实例 |
| `model.model_dump(exclude_unset=True)` | 序列化为 dict（排除未设置字段） |
| `model.sqlmodel_update(data)` | 用 dict 更新模型实例 |
| `SQLModel.metadata.create_all(engine)` | 创建所有表（仅开发用） |

## 常见陷阱

- **id 字段必须是 Optional**：`id: int | None = Field(default=None, primary_key=True)`。如果声明为 `id: int`，创建对象时必须传入 id 值，无法使用数据库自增。
- **table=True 遗漏**：忘记 `table=True` 的类不会映射到数据库表，只是纯 Pydantic 模型。不会报错但插入时找不到表。
- **session.exec vs session.execute**：`session.exec()` 是 SQLModel 提供的便捷方法，返回类型更好；`session.execute()` 是 SQLAlchemy 原生方法。两者都可以用，但 `exec` 对 SQLModel 对象的类型推导更友好。
- **Relationship 不出现在 API 响应中**：`Relationship` 字段默认不包含在 Pydantic 序列化中。需要在响应模型中显式声明或使用 `model_config = {"from_attributes": True}` 配合嵌套模型。
- **SQLModel 不包装异步 API**：SQLModel 没有 `AsyncSession` 包装器。异步场景需直接使用 `sqlalchemy.ext.asyncio.AsyncSession`，但模型定义仍可用 SQLModel。
- **验证仅在 Pydantic 层生效**：`Field(ge=0)` 等验证仅在 Python 创建对象时生效，不会创建数据库层 CHECK 约束。数据库层保护需额外添加。
- **model_dump(exclude_unset=True) 与 None 的区别**：`exclude_unset=True` 排除客户端未传的字段（而不是值为 None 的字段），这对 PATCH 更新很关键——可以区分"没传"和"显式设为 null"。

## 组合提示

- 与 **sqlalchemy-core** 搭配配置引擎和异步 Session
- 与 **sqlalchemy-migrations** 搭配使用 Alembic 管理迁移（`target_metadata = SQLModel.metadata`）
- 与 **sqlalchemy-orm** 搭配理解底层关系映射原理
- 与 **sqlalchemy-advanced** 搭配在 SQLModel 模型中使用 `sa_column` 接入高级特性
