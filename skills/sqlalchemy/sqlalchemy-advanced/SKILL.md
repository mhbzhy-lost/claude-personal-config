---
name: sqlalchemy-advanced
description: "SQLAlchemy 2.0 高级特性：混合属性、事件监听、批量操作、查询优化与表继承"
tech_stack: [sqlalchemy, backend]
language: [python]
capability: [orm, relational-db]
---

# SQLAlchemy Advanced（高级特性）

> 来源：https://docs.sqlalchemy.org/en/20/orm/extensions/hybrid.html
> 版本基准：SQLAlchemy 2.0.4+

## 用途

覆盖 SQLAlchemy 的高级 ORM 特性——混合属性实现 Python/SQL 双向计算、事件监听注入业务逻辑钩子、批量操作提升写入性能、加载策略优化查询效率、表继承实现多态模型。

## 何时使用

- 模型中有需要在 Python 和 SQL 中同时生效的计算属性
- 需要在数据变更时自动触发审计、校验、缓存失效等副作用
- 批量导入/更新大量数据需要高性能
- 查询涉及多层关系需要优化 N+1 问题
- 业务模型存在继承关系（如 Payment → CreditCardPayment / BankTransfer）

## 混合属性（hybrid_property）

### 基础用法

```python
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(50))
    last_name: Mapped[str] = mapped_column(String(50))

    @hybrid_property
    def full_name(self) -> str:
        """Python 层：拼接字符串"""
        return f"{self.first_name} {self.last_name}"

    @full_name.inplace.expression
    @classmethod
    def _full_name_expression(cls) -> ColumnElement[str]:
        """SQL 层：生成 SQL 表达式，支持 WHERE / ORDER BY"""
        return cls.first_name + " " + cls.last_name
```

```python
# Python 层
user = session.get(User, 1)
print(user.full_name)  # "John Doe"

# SQL 层（生成 WHERE first_name || ' ' || last_name = 'John Doe'）
stmt = select(User).where(User.full_name == "John Doe")
```

### 带 setter 的混合属性

```python
class Interval(Base):
    __tablename__ = "intervals"

    id: Mapped[int] = mapped_column(primary_key=True)
    start: Mapped[int] = mapped_column()
    end: Mapped[int] = mapped_column()

    @hybrid_property
    def length(self) -> int:
        return self.end - self.start

    @length.inplace.setter
    def _length_setter(self, value: int) -> None:
        self.end = self.start + value

    @length.inplace.expression
    @classmethod
    def _length_expression(cls) -> ColumnElement[int]:
        return cls.end - cls.start
```

### 混合属性用于过滤和排序

```python
class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    price: Mapped[float] = mapped_column()
    discount: Mapped[float] = mapped_column(default=0.0)

    @hybrid_property
    def final_price(self) -> float:
        return self.price * (1 - self.discount)

    @final_price.inplace.expression
    @classmethod
    def _final_price_expression(cls) -> ColumnElement[float]:
        return cls.price * (1 - cls.discount)

# 查询最终价格低于 100 的商品
stmt = select(Product).where(Product.final_price < 100).order_by(Product.final_price)
```

## 事件监听（event.listen）

### Mapper 事件

```python
from sqlalchemy import event
from sqlalchemy.orm import Session


# 方式一：装饰器
@event.listens_for(User, "before_insert")
def set_created_at(mapper, connection, target):
    """插入前自动设置 created_at"""
    target.created_at = datetime.now(timezone.utc)


@event.listens_for(User, "before_update")
def set_updated_at(mapper, connection, target):
    """更新前自动设置 updated_at"""
    target.updated_at = datetime.now(timezone.utc)


# 方式二：函数调用
def audit_log(mapper, connection, target):
    print(f"Inserting: {target}")

event.listen(User, "after_insert", audit_log)
```

### Session 事件（推荐）

```python
@event.listens_for(Session, "before_flush")
def before_flush(session, flush_context, instances):
    """flush 前检查所有待变更对象"""
    for obj in session.new:
        if isinstance(obj, User):
            obj.name = obj.name.strip()

    for obj in session.dirty:
        if isinstance(obj, User) and session.is_modified(obj):
            obj.updated_at = datetime.now(timezone.utc)
```

### 连接事件

```python
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """SQLite 连接时开启外键约束"""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()
```

### 属性事件

```python
@event.listens_for(User.email, "set")
def validate_email(target, value, oldvalue, initiator):
    """设置 email 时自动转小写"""
    if value is not None:
        return value.lower()
    return value
```

### 常用事件清单

| 事件 | 触发时机 | 参数 |
|------|----------|------|
| `before_insert` | INSERT 前 | mapper, connection, target |
| `after_insert` | INSERT 后 | mapper, connection, target |
| `before_update` | UPDATE 前 | mapper, connection, target |
| `after_update` | UPDATE 后 | mapper, connection, target |
| `before_delete` | DELETE 前 | mapper, connection, target |
| `before_flush` | flush 前 | session, flush_context, instances |
| `after_flush` | flush 后 | session, flush_context |
| `attribute "set"` | 属性赋值时 | target, value, oldvalue, initiator |

## 批量操作

### 新式批量 INSERT（2.0 推荐）

```python
from sqlalchemy import insert

# 方式一：ORM 批量插入（推荐，支持 RETURNING）
users_data = [{"name": f"user_{i}", "email": f"user_{i}@example.com"} for i in range(10000)]
session.execute(insert(User), users_data)
session.commit()

# 方式二：带 RETURNING（PostgreSQL）
result = session.execute(
    insert(User).returning(User.id, User.name),
    users_data,
)
new_users = result.all()  # [(1, 'user_0'), (2, 'user_1'), ...]
session.commit()
```

### 批量 UPDATE

```python
from sqlalchemy import update

# 条件批量更新
session.execute(
    update(User).where(User.is_active == False).values(name="[deactivated]")
)
session.commit()

# 按主键批量更新
updates = [
    {"id": 1, "name": "Alice Updated"},
    {"id": 2, "name": "Bob Updated"},
]
session.execute(update(User), updates)
session.commit()
```

### 批量 DELETE

```python
from sqlalchemy import delete

session.execute(delete(User).where(User.is_active == False))
session.commit()
```

### 性能对比

| 方式 | 10000 行 INSERT 耗时 | 说明 |
|------|----------------------|------|
| `session.add()` 循环 | ~5s | 最慢，每行一条 INSERT |
| `session.add_all(list)` | ~3s | 稍快，批量 flush |
| `session.execute(insert(Model), data)` | ~0.2s | 推荐，使用 executemany + RETURNING |
| `engine.execute(table.insert(), data)` | ~0.1s | Core 层，最快，无 ORM 开销 |

> 旧版 `session.bulk_insert_mappings()` 在 2.0 中已标记为 legacy，请使用 `session.execute(insert(Model), data)` 替代。

## 查询性能优化

### 加载策略选择

```python
from sqlalchemy.orm import joinedload, selectinload, subqueryload, raiseload

# selectinload：一对多集合的最佳选择
stmt = select(Department).options(selectinload(Department.employees))
# 生成: SELECT * FROM departments; SELECT * FROM employees WHERE dept_id IN (1,2,3...)

# joinedload：多对一的最佳选择
stmt = select(Employee).options(joinedload(Employee.department))
# 生成: SELECT * FROM employees LEFT JOIN departments ON ...

# 多层嵌套加载
stmt = select(Department).options(
    selectinload(Department.employees)
    .joinedload(Employee.profile)
    .selectinload(Profile.skills)
)

# raiseload：开发阶段检测 N+1
stmt = select(User).options(raiseload("*"))
# 访问任何未预加载的关系都会抛 InvalidRequestError
```

### 仅加载需要的列

```python
# 只查特定列（减少数据传输）
stmt = select(User.id, User.name)
result = session.execute(stmt).all()  # 返回 Row 对象，非 ORM 实例

# deferred loading（延迟加载大字段）
from sqlalchemy.orm import deferred

class Article(Base):
    __tablename__ = "articles"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = deferred(mapped_column(Text))
    # content 仅在被访问时才查询
```

### 使用 contains_eager 配合手动 JOIN

```python
from sqlalchemy.orm import contains_eager

# 当你已经写了 JOIN 条件，用 contains_eager 告诉 ORM 复用 JOIN 结果
stmt = (
    select(Employee)
    .join(Employee.department)
    .where(Department.name == "Engineering")
    .options(contains_eager(Employee.department))
)
# 只生成一条 SQL，且 employee.department 已填充
```

## 复合索引

```python
from sqlalchemy import Index, UniqueConstraint

class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        # 复合索引（查询优化）
        Index("ix_order_user_created", "user_id", "created_at"),
        # 复合唯一约束
        UniqueConstraint("user_id", "product_id", name="uq_user_product"),
        # 条件索引（PostgreSQL）
        Index(
            "ix_order_active",
            "user_id",
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    status: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### 索引设计原则

- 复合索引遵循**最左前缀原则**：`Index("a", "b", "c")` 可以加速 `WHERE a=?`、`WHERE a=? AND b=?`，但不能加速 `WHERE b=?`
- 单列高基数字段优先索引（如 user_id），低基数字段（如 status）通常不单独建索引
- 覆盖索引（covering index）可避免回表

## 表继承

### Joined Table Inheritance（推荐）

```python
class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    amount: Mapped[float] = mapped_column()
    type: Mapped[str] = mapped_column(String(30))

    __mapper_args__ = {
        "polymorphic_on": "type",
        "polymorphic_identity": "payment",
    }


class CreditCardPayment(Payment):
    __tablename__ = "credit_card_payments"

    id: Mapped[int] = mapped_column(ForeignKey("payments.id"), primary_key=True)
    card_number: Mapped[str] = mapped_column(String(20))

    __mapper_args__ = {
        "polymorphic_identity": "credit_card",
    }


class BankTransfer(Payment):
    __tablename__ = "bank_transfers"

    id: Mapped[int] = mapped_column(ForeignKey("payments.id"), primary_key=True)
    bank_name: Mapped[str] = mapped_column(String(100))
    account_number: Mapped[str] = mapped_column(String(30))

    __mapper_args__ = {
        "polymorphic_identity": "bank_transfer",
    }
```

```python
# 查询所有 Payment（自动 JOIN 子表并返回正确子类实例）
payments = session.execute(select(Payment)).scalars().all()
for p in payments:
    print(type(p))  # CreditCardPayment 或 BankTransfer

# 只查询特定子类
cc_payments = session.execute(select(CreditCardPayment)).scalars().all()
```

### Single Table Inheritance

```python
class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    type: Mapped[str] = mapped_column(String(30))

    __mapper_args__ = {
        "polymorphic_on": "type",
        "polymorphic_identity": "employee",
    }


class Manager(Employee):
    # 没有 __tablename__（共用 employees 表）
    department: Mapped[str | None] = mapped_column(String(50), default=None)

    __mapper_args__ = {
        "polymorphic_identity": "manager",
    }


class Engineer(Employee):
    language: Mapped[str | None] = mapped_column(String(30), default=None)

    __mapper_args__ = {
        "polymorphic_identity": "engineer",
    }
```

### 继承策略选择

| 策略 | 表结构 | 优点 | 缺点 |
|------|--------|------|------|
| Joined | 每个子类一张表 | 数据紧凑、无冗余列 | 查询需要 JOIN |
| Single | 所有子类共用一张表 | 查询简单、无 JOIN | 表宽、大量 NULL 列 |
| Concrete | 每个子类完全独立的表 | 完全隔离 | 多态查询需要 UNION，不推荐 |

## 1.x vs 2.0 关键变更（高级特性部分）

| 1.x | 2.0 |
|-----|-----|
| `session.bulk_insert_mappings(Model, data)` | `session.execute(insert(Model), data)` |
| `session.bulk_update_mappings(Model, data)` | `session.execute(update(Model), data)` |
| `@hybrid.expression` 同名函数 | `@hybrid.inplace.expression` 不同名函数（更好的类型支持） |
| `session.query(Model).update({...})` | `session.execute(update(Model).values({...}))` |

## 常见陷阱

- **hybrid_property expression 忘记写**：只定义 Python 侧的 hybrid_property 而不定义 expression，在 `WHERE` 中使用时会尝试 Python 比较导致错误或全表扫描。
- **事件中修改对象但不 add**：在 `before_flush` 等事件中修改 `session.dirty` 中的对象时，如果修改的是新属性，需确保 ORM 能感知到变更。直接赋值 mapped 属性即可，不需要额外 `session.add()`。
- **批量操作绕过事件**：`session.execute(insert(Model), data)` 不触发 `before_insert` / `after_insert` 等 mapper 事件。需要事件钩子时，使用 `session.add_all()` 或在批量操作前后手动处理。
- **joinedload 导致分页错误**：对一对多关系使用 `joinedload` 时，JOIN 会展开行数，`LIMIT` 作用在展开后的行上而非父对象上。一对多分页场景应使用 `selectinload`。
- **表继承的 polymorphic_on 列必须在基类表中**：discriminator 列必须在父类的 `__tablename__` 对应的表中定义。
- **Single Table Inheritance 子类列都是 nullable**：因为不同子类共用表，其他子类的专属列只能为 NULL。不要在子类专属列上设置 NOT NULL。
- **raiseload 在生产环境**：`raiseload("*")` 适合开发阶段发现 N+1，但生产环境会导致运行时异常。可通过配置或环境变量控制是否启用。

## 组合提示

- 与 **sqlalchemy-core** 搭配配置引擎和 Session（异步批量操作需要 AsyncSession）
- 与 **sqlalchemy-orm** 搭配理解基础模型定义和关系映射
- 与 **sqlalchemy-migrations** 搭配确保表继承和索引变更正确反映在迁移中
- 与 **sqlmodel-core** 搭配使用 `sa_column=Column(...)` 在 SQLModel 中接入 hybrid_property 等高级特性
