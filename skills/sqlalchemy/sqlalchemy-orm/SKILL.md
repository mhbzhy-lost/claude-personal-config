---
name: sqlalchemy-orm
description: "SQLAlchemy 2.0 ORM 模型定义、关系映射与查询 API"
tech_stack: [sqlalchemy]
---

# SQLAlchemy ORM（模型与查询）

> 来源：https://docs.sqlalchemy.org/en/20/orm/quickstart.html
> 版本基准：SQLAlchemy 2.0+

## 用途

通过 Python 类映射数据库表，使用类型安全的声明式语法定义列和关系，并用 `select()` 构建查询——这是 SQLAlchemy 2.0 的核心 ORM 层。

## 何时使用

- 定义数据库表结构（模型类）
- 建立表之间的关系（一对多、多对多、自引用）
- 编写类型安全的数据库查询
- 需要 eager/lazy loading 策略控制关联数据加载

## 模型定义（DeclarativeBase）

### 基础结构

```python
from datetime import datetime
from typing import Optional
from sqlalchemy import String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """所有模型的基类，替代旧版 declarative_base()"""
    pass


class User(Base):
    __tablename__ = "users"

    # 主键
    id: Mapped[int] = mapped_column(primary_key=True)
    # NOT NULL 字符串列（Mapped[str] 默认 NOT NULL）
    name: Mapped[str] = mapped_column(String(50))
    # 可空列（Optional 或 | None 标注 → NULL）
    email: Mapped[Optional[str]] = mapped_column(String(100), unique=True)
    # 或使用 Python 3.10+ 语法
    nickname: Mapped[str | None] = mapped_column(String(30))
    # 带默认值
    is_active: Mapped[bool] = mapped_column(default=True)
    # 服务端默认值
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### 类型映射规则

| Python 类型 | 默认 SQL 类型 | NULL? |
|-------------|---------------|-------|
| `Mapped[int]` | Integer | NOT NULL |
| `Mapped[str]` | String (无长度) | NOT NULL |
| `Mapped[Optional[str]]` | String | NULL |
| `Mapped[str \| None]` | String | NULL |
| `Mapped[float]` | Float | NOT NULL |
| `Mapped[bool]` | Boolean | NOT NULL |
| `Mapped[datetime]` | DateTime | NOT NULL |
| `Mapped[bytes]` | LargeBinary | NOT NULL |

> 当需要指定长度（如 `String(50)`）或其他数据库类型（如 `Text`、`Numeric`），在 `mapped_column()` 中显式传入。

### 复合约束与索引

```python
from sqlalchemy import Index, UniqueConstraint

class Article(Base):
    __tablename__ = "articles"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_article_slug"),
        Index("ix_article_author_created", "author_id", "created_at"),
        # __table_args__ 必须是 tuple，注意尾部逗号
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(200))
    author_id: Mapped[int] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### 通用基类 Mixin

```python
from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
```

## 关系映射

### 一对多（One-to-Many）

```python
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))

    # 一个部门有多个员工
    employees: Mapped[list["Employee"]] = relationship(
        back_populates="department",
        cascade="all, delete-orphan",
    )


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))

    # 多对一反向引用
    department: Mapped["Department"] = relationship(back_populates="employees")
```

### 一对一（One-to-One）

```python
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)

    # uselist=False 表示一对一
    profile: Mapped["Profile"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)

    user: Mapped["User"] = relationship(back_populates="profile")
```

### 多对多（Many-to-Many）

```python
from sqlalchemy import Column, ForeignKey, Table

# 方式一：关联表（无额外字段）
user_role_table = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id"), primary_key=True),
    Column("role_id", ForeignKey("roles.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))

    roles: Mapped[list["Role"]] = relationship(
        secondary=user_role_table, back_populates="users"
    )


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(30))

    users: Mapped[list["User"]] = relationship(
        secondary=user_role_table, back_populates="roles"
    )
```

```python
# 方式二：关联对象（有额外字段）
class UserRole(Base):
    __tablename__ = "user_roles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), primary_key=True)
    granted_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="user_roles")
    role: Mapped["Role"] = relationship(back_populates="user_roles")
```

### 自引用关系

```python
class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))

    # remote_side 指明"多"的一端指向的是父级的 id
    parent: Mapped["Category | None"] = relationship(
        back_populates="children", remote_side="Category.id"
    )
    children: Mapped[list["Category"]] = relationship(back_populates="parent")
```

## 查询 API（select 风格）

### 基础查询

```python
from sqlalchemy import select

# 查询所有
stmt = select(User)
result = session.execute(stmt)
users = result.scalars().all()

# 条件查询
stmt = select(User).where(User.name == "alice")
user = session.execute(stmt).scalar_one_or_none()

# 多条件
stmt = select(User).where(User.is_active == True, User.name.like("a%"))

# 排序 + 分页
stmt = (
    select(User)
    .order_by(User.created_at.desc())
    .offset(0)
    .limit(20)
)
```

### JOIN 查询

```python
# 隐式 JOIN（通过关系）
stmt = (
    select(Employee)
    .join(Employee.department)
    .where(Department.name == "Engineering")
)

# 显式 JOIN
stmt = (
    select(User, Role)
    .join(user_role_table, User.id == user_role_table.c.user_id)
    .join(Role, Role.id == user_role_table.c.role_id)
)

# 左外连接
stmt = select(User).outerjoin(User.profile)
```

### 聚合与分组

```python
from sqlalchemy import func

stmt = (
    select(Department.name, func.count(Employee.id).label("emp_count"))
    .join(Department.employees)
    .group_by(Department.name)
    .having(func.count(Employee.id) > 5)
)
```

### 异步查询

```python
async with async_session() as session:
    result = await session.execute(select(User).where(User.id == 1))
    user = result.scalar_one_or_none()

    # scalars() 用于获取 ORM 对象列表
    result = await session.execute(select(User))
    users = result.scalars().all()
```

## Eager / Lazy Loading

### 默认行为（Lazy Loading）

访问 `user.roles` 时才发 SQL 查询。在异步 Session 中会报错（无法隐式触发同步 IO）。

### Eager Loading 策略

```python
from sqlalchemy.orm import joinedload, selectinload, subqueryload

# joinedload：LEFT OUTER JOIN，适合多对一
stmt = select(Employee).options(joinedload(Employee.department))

# selectinload：额外 SELECT ... WHERE id IN (...)，适合一对多 / 多对多（推荐）
stmt = select(Department).options(selectinload(Department.employees))

# subqueryload：额外子查询，适合嵌套关系
stmt = select(User).options(subqueryload(User.roles))

# 嵌套加载
stmt = select(Department).options(
    selectinload(Department.employees).joinedload(Employee.profile)
)
```

### 在模型上设置默认加载策略

```python
class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)

    employees: Mapped[list["Employee"]] = relationship(
        back_populates="department",
        lazy="selectin",  # 默认 eager loading
    )
```

### 策略选择指南

| 策略 | SQL 方式 | 适用场景 |
|------|----------|----------|
| `joinedload` | LEFT JOIN | 多对一、数据量小的一对一 |
| `selectinload` | SELECT ... IN | 一对多、多对多集合（推荐默认） |
| `subqueryload` | 子查询 | 复杂嵌套查询 |
| `lazyload` | 访问时查询 | 同步 Session + 不一定需要的关系 |
| `raiseload` | 访问时报错 | 强制显式加载，防止 N+1 |

## 1.x vs 2.0 关键变更

| 1.x 旧写法 | 2.0 新写法 |
|-------------|-----------|
| `declarative_base()` | `class Base(DeclarativeBase)` |
| `Column(Integer, primary_key=True)` | `mapped_column(primary_key=True)` 配合 `Mapped[int]` |
| `Column(String, nullable=True)` | `Mapped[Optional[str]]` |
| `session.query(User).filter(...)` | `session.execute(select(User).where(...))` |
| `session.query(User).first()` | `session.execute(select(User)).scalar()` |
| `backref="users"` | `back_populates="users"`（显式双向，推荐） |

## 常见陷阱

- **N+1 查询问题**：遍历父对象列表并访问其关联属性时，每次访问触发一条 SQL。使用 `selectinload` / `joinedload` 解决。可在开发阶段使用 `raiseload("*")` 强制暴露 N+1。
- **异步 Session 中的 Lazy Loading**：AsyncSession 不支持隐式 lazy loading，访问未加载的关系属性会抛 `MissingGreenlet` 错误。必须使用 eager loading 或 `await session.run_sync()`。
- **back_populates 拼写错误**：两侧的 `back_populates` 值必须精确匹配对方的属性名，拼错不会报错但关系不同步。
- **忘记 cascade 设置**：删除父对象时，如未设置 `cascade="all, delete-orphan"`，子对象的外键会变为 NULL 或报外键约束错误。
- **Mapped[list] 初始化**：关系属性在 `__init__` 中默认为空列表，但手动 `__init__` 时需注意不要用可变默认参数。
- **String 无长度**：`Mapped[str]` 不指定 `String(n)` 时，某些数据库（MySQL）会使用 `TEXT` 类型而非 `VARCHAR`，可能影响索引。

## 组合提示

- 与 **sqlalchemy-core** 搭配配置引擎和 Session
- 与 **sqlalchemy-migrations** 搭配通过 Alembic 生成和管理迁移
- 与 **sqlalchemy-advanced** 搭配使用混合属性、事件、性能优化
- 与 **sqlmodel-core** 搭配在 FastAPI 中使用更简洁的模型定义
