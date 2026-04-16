---
name: fastapi-dependencies
description: "依赖注入系统、Depends 函数/类依赖、yield 依赖（数据库会话等）、子依赖链、作用域控制、全局依赖"
tech_stack: [fastapi]
---

# FastAPI Dependencies -- 依赖注入系统

> 来源：https://fastapi.tiangolo.com/tutorial/dependencies/ / https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/
> 版本基准：FastAPI 0.115+（Python 3.10+）

## 用途

FastAPI 的依赖注入（DI）系统用于声明路由处理函数所需的外部资源和前置逻辑，实现代码复用、关注点分离和可测试性。

## 何时使用

- 多个端点共享相同的参数解析逻辑（分页、过滤）
- 需要注入数据库会话、Redis 连接等资源
- 实现认证 / 鉴权前置检查
- 构建可被测试覆盖（override）的服务层

## 函数依赖 -- 基础

```python
from typing import Annotated
from fastapi import Depends, FastAPI

app = FastAPI()

async def common_parameters(
    q: str | None = None,
    skip: int = 0,
    limit: int = 100,
):
    return {"q": q, "skip": skip, "limit": limit}

# 推荐：创建类型别名复用
CommonsDep = Annotated[dict, Depends(common_parameters)]

@app.get("/items/")
async def read_items(commons: CommonsDep):
    return commons

@app.get("/users/")
async def read_users(commons: CommonsDep):
    return commons
```

依赖函数可以声明与路由函数相同类型的参数（路径参数、查询参数、请求体等），FastAPI 会自动解析注入。

## 类依赖

```python
from typing import Annotated
from fastapi import Depends, FastAPI

app = FastAPI()

class CommonQueryParams:
    def __init__(self, q: str | None = None, skip: int = 0, limit: int = 100):
        self.q = q
        self.skip = skip
        self.limit = limit

@app.get("/items/")
async def read_items(commons: Annotated[CommonQueryParams, Depends()]):
    # 当类型注解与 Depends 的参数相同时，可省略 Depends 内的参数
    response = {}
    if commons.q:
        response["q"] = commons.q
    return response
```

`Depends()` 不传参数时，FastAPI 自动使用类型注解中的类作为依赖。

## 子依赖链

```python
from typing import Annotated
from fastapi import Depends, FastAPI, HTTPException

app = FastAPI()

async def get_db():
    """最底层依赖：提供数据库连接"""
    db = FakeDB()
    return db

async def get_current_user(db: Annotated[FakeDB, Depends(get_db)]):
    """中间层依赖：依赖 db，返回当前用户"""
    user = db.get_user_from_token("...")
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

async def get_current_active_user(
    user: Annotated[User, Depends(get_current_user)],
):
    """顶层依赖：依赖 current_user，检查是否激活"""
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")
    return user

@app.get("/me")
async def read_user_me(user: Annotated[User, Depends(get_current_active_user)]):
    return user
```

FastAPI 自动解析完整依赖链：`get_db` -> `get_current_user` -> `get_current_active_user`。

## Yield 依赖 -- 资源管理

`yield` 依赖用于需要在请求结束后执行清理逻辑的场景（如关闭数据库会话）。

### 数据库会话管理

```python
from typing import Annotated
from collections.abc import Generator
from fastapi import Depends, FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

engine = create_engine("sqlite:///./test.db")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db        # 注入 db 给路由函数
    finally:
        db.close()      # 请求结束后清理

app = FastAPI()
DbDep = Annotated[Session, Depends(get_db)]

@app.get("/users/{user_id}")
def read_user(user_id: int, db: DbDep):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.post("/users/")
def create_user(user_in: UserCreate, db: DbDep):
    user = User(**user_in.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
```

### 异步数据库会话

```python
from typing import Annotated
from collections.abc import AsyncGenerator
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

engine = create_async_engine("postgresql+asyncpg://user:pass@localhost/mydb")
async_session = async_sessionmaker(engine, expire_on_commit=False)

async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

AsyncDbDep = Annotated[AsyncSession, Depends(get_async_db)]

@app.get("/users/{user_id}")
async def read_user(user_id: int, db: AsyncDbDep):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    return user
```

### Yield 依赖中的异常处理

```python
from fastapi import Depends, HTTPException

class OwnerError(Exception):
    pass

def get_username():
    try:
        yield "Rick"
    except OwnerError as e:
        # 可以将业务异常转换为 HTTP 异常
        raise HTTPException(status_code=400, detail=f"Owner error: {e}")

@app.get("/items/{item_id}")
def get_item(item_id: str, username: Annotated[str, Depends(get_username)]):
    item = data[item_id]
    if item["owner"] != username:
        raise OwnerError(username)  # 会被依赖的 except 捕获
    return item
```

**重要**：在 yield 依赖的 `except` 块中如果不重新 raise，客户端会收到 500 错误且服务端无日志。务必重新 raise 或转换为 HTTPException。

## 路径操作装饰器依赖

用于不需要返回值的依赖（如权限检查），直接放在装饰器中：

```python
from typing import Annotated
from fastapi import Depends, FastAPI, Header, HTTPException

async def verify_token(x_token: Annotated[str, Header()]):
    if x_token != "fake-super-secret-token":
        raise HTTPException(status_code=403, detail="Invalid token")

async def verify_key(x_key: Annotated[str, Header()]):
    if x_key != "fake-super-secret-key":
        raise HTTPException(status_code=403, detail="Invalid key")

app = FastAPI()

@app.get("/items/", dependencies=[Depends(verify_token), Depends(verify_key)])
async def read_items():
    return [{"item": "Foo"}]
```

## 全局依赖

应用于所有路由：

```python
app = FastAPI(dependencies=[Depends(verify_token)])
```

应用于特定 Router：

```python
router = APIRouter(
    prefix="/admin",
    dependencies=[Depends(verify_admin)],
)
```

## 依赖作用域

```python
from fastapi import Depends

# 默认作用域 "request"：cleanup 在响应发送后执行
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()  # 响应发送后执行

# 函数作用域：cleanup 在路由函数返回后、响应发送前执行
@app.get("/users/")
def list_users(db: Annotated[Session, Depends(get_db, scope="function")]):
    return db.query(User).all()
```

## 依赖缓存

同一请求中，如果多个依赖使用了相同的子依赖，默认只调用一次：

```python
async def get_db():
    print("Creating DB session")  # 只打印一次
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_users(db: Annotated[Session, Depends(get_db)]):
    return db.query(User).all()

async def get_items(db: Annotated[Session, Depends(get_db)]):
    return db.query(Item).all()

@app.get("/dashboard")
async def dashboard(
    users: Annotated[list, Depends(get_users)],
    items: Annotated[list, Depends(get_items)],
):
    # get_db 只调用一次，users 和 items 共享同一个 session
    return {"users": users, "items": items}
```

如需每次都创建新实例，使用 `Depends(get_db, use_cache=False)`。

## 完整实战示例：分层架构

```python
# dependencies.py
from typing import Annotated
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

DbDep = Annotated[Session, Depends(get_db)]

async def get_current_user(db: DbDep, token: str = Depends(oauth2_scheme)) -> User:
    user = authenticate(db, token)
    if not user:
        raise HTTPException(status_code=401)
    return user

CurrentUserDep = Annotated[User, Depends(get_current_user)]

# routers/items.py
from fastapi import APIRouter
from ..dependencies import DbDep, CurrentUserDep

router = APIRouter(prefix="/items", tags=["items"])

@router.get("/")
def list_items(db: DbDep, user: CurrentUserDep):
    return db.query(Item).filter(Item.owner_id == user.id).all()
```

## 常见陷阱

- **yield 依赖只能 yield 一次**：不能在一个依赖中有多个 yield 语句
- **yield 后不要吞异常**：except 块中必须 re-raise 或转为 HTTPException，否则客户端收到 500 且无日志
- **sync 和 async 可以混用**：`def` 依赖会在线程池中运行，`async def` 依赖在事件循环中运行，两者可以互相依赖
- **Depends() 的快捷写法**：`commons: Annotated[MyClass, Depends()]` 等同于 `Depends(MyClass)`，但仅当类型注解和依赖相同时可用
- **全局依赖的异常处理**：全局依赖抛出异常会影响所有路由，确保异常信息对用户友好
- **依赖缓存可能导致意外**：如果依赖有副作用且需要每次调用，使用 `use_cache=False`

## 组合提示

- 配合 **fastapi-auth** 构建认证/鉴权依赖链
- 配合 **fastapi-testing** 使用 `dependency_overrides` 替换依赖进行测试
- 配合 **fastapi-core** 了解全局依赖在 FastAPI 实例和 APIRouter 上的配置
- 配合 **fastapi-async** 理解 sync/async 依赖的执行模型差异
