---
name: fastapi-routing
description: "路由定义、路径参数、查询参数、请求体、响应模型、状态码、Tags、APIRouter 模块化"
tech_stack: [fastapi]
language: [python]
---

# FastAPI Routing -- 路由与请求/响应处理

> 来源：https://fastapi.tiangolo.com/tutorial/path-params/ / https://fastapi.tiangolo.com/tutorial/query-params/ / https://fastapi.tiangolo.com/tutorial/body/ / https://fastapi.tiangolo.com/tutorial/response-model/
> 版本基准：FastAPI 0.115+（Python 3.10+）

## 用途

定义 API 端点的完整流程：HTTP 方法绑定、参数提取与验证、请求体解析、响应模型过滤与序列化。

## 何时使用

- 定义 RESTful API 端点
- 需要对路径参数、查询参数进行类型验证和约束
- 需要用不同的模型分离输入和输出（如隐藏密码字段）
- 组织大型 API 的路由分组（tags）和模块拆分（APIRouter）

## HTTP 方法装饰器

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/")          # 查询
@app.post("/items/")         # 创建
@app.put("/items/{id}")      # 全量更新
@app.patch("/items/{id}")    # 部分更新
@app.delete("/items/{id}")   # 删除
@app.options("/items/")      # 预检
@app.head("/items/")         # 只返回头
```

## 路径参数

### 基础类型转换

```python
@app.get("/items/{item_id}")
async def read_item(item_id: int):
    return {"item_id": item_id}
# GET /items/42 -> {"item_id": 42}
# GET /items/abc -> 422 Validation Error
```

### 枚举约束

```python
from enum import Enum

class ModelName(str, Enum):
    alexnet = "alexnet"
    resnet = "resnet"
    lenet = "lenet"

@app.get("/models/{model_name}")
async def get_model(model_name: ModelName):
    if model_name is ModelName.alexnet:
        return {"model_name": model_name, "message": "Deep Learning FTW!"}
    return {"model_name": model_name, "message": "Other model"}
```

### 路径参数中包含路径

```python
@app.get("/files/{file_path:path}")
async def read_file(file_path: str):
    return {"file_path": file_path}
# GET /files/home/user/data.csv -> {"file_path": "home/user/data.csv"}
```

## 查询参数

### 基础用法（带默认值、可选、必填）

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/")
async def read_items(
    skip: int = 0,                    # 有默认值 -> 可选
    limit: int = 10,                  # 有默认值 -> 可选
    q: str | None = None,             # None 默认值 -> 可选
    needy: str,                       # 无默认值 -> 必填
):
    return {"skip": skip, "limit": limit, "q": q, "needy": needy}
```

### 使用 Query 添加验证和元数据

```python
from typing import Annotated
from fastapi import FastAPI, Query

app = FastAPI()

@app.get("/items/")
async def read_items(
    q: Annotated[
        str | None,
        Query(
            min_length=3,
            max_length=50,
            pattern="^[a-zA-Z0-9]+$",
            title="搜索关键词",
            description="用于在数据库中搜索匹配项",
            alias="item-query",       # URL 中使用 ?item-query=xxx
            deprecated=True,          # 标记为已弃用
        ),
    ] = None,
):
    return {"q": q}
```

### 接收列表参数

```python
@app.get("/items/")
async def read_items(
    q: Annotated[list[str] | None, Query()] = None,
):
    return {"q": q}
# GET /items/?q=foo&q=bar -> {"q": ["foo", "bar"]}
```

## 请求体

### 基础 Pydantic 模型

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class ItemCreate(BaseModel):
    name: str
    description: str | None = None
    price: float
    tax: float | None = None

@app.post("/items/")
async def create_item(item: ItemCreate):
    item_dict = item.model_dump()
    if item.tax is not None:
        item_dict["price_with_tax"] = item.price + item.tax
    return item_dict
```

### 混合路径参数 + 请求体 + 查询参数

```python
@app.put("/items/{item_id}")
async def update_item(
    item_id: int,                # 路径参数（匹配 URL 路径）
    item: ItemCreate,            # 请求体（Pydantic 模型 -> 从 body 读取）
    q: str | None = None,        # 查询参数（简单类型 -> 从 query string 读取）
):
    result = {"item_id": item_id, **item.model_dump()}
    if q:
        result["q"] = q
    return result
```

**FastAPI 自动识别规则**：
- 参数名出现在路径中 -> 路径参数
- 类型为 Pydantic 模型 -> 请求体
- 简单类型（int, str, float, bool 等） -> 查询参数

## 响应模型

### 使用返回类型注解（推荐）

```python
class ItemOut(BaseModel):
    name: str
    description: str | None = None
    price: float
    tags: list[str] = []

@app.post("/items/")
async def create_item(item: ItemCreate) -> ItemOut:
    return item  # FastAPI 自动按 ItemOut 过滤字段
```

### 输入输出模型分离（隐藏敏感字段）

```python
from pydantic import BaseModel, EmailStr

class BaseUser(BaseModel):
    username: str
    email: EmailStr
    full_name: str | None = None

class UserIn(BaseUser):
    password: str

class UserOut(BaseUser):
    pass  # 不含 password

@app.post("/users/", response_model=UserOut)
async def create_user(user: UserIn):
    # 即使 return user 包含 password，响应也会被过滤
    return user
```

### response_model 高级参数

```python
@app.get(
    "/items/{item_id}",
    response_model=ItemOut,
    response_model_exclude_unset=True,   # 只返回显式设置的字段
    response_model_exclude={"tax"},      # 排除特定字段
    response_model_include={"name", "price"},  # 只包含特定字段
)
async def read_item(item_id: str):
    return items[item_id]
```

## 状态码

```python
from fastapi import FastAPI, status

app = FastAPI()

@app.post("/items/", status_code=status.HTTP_201_CREATED)
async def create_item(item: ItemCreate):
    return item

@app.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: int):
    return None
```

常用状态码：
- `200` OK（默认）
- `201` Created
- `204` No Content
- `301/307` Redirect
- `400` Bad Request
- `401` Unauthorized
- `403` Forbidden
- `404` Not Found
- `409` Conflict
- `422` Unprocessable Entity（验证失败）

## Tags 分组

```python
@app.get("/users/", tags=["users"])
async def list_users():
    return []

@app.get("/items/", tags=["items"])
async def list_items():
    return []
```

也可以在 APIRouter 上统一设置：

```python
from fastapi import APIRouter

router = APIRouter(prefix="/items", tags=["items"])

@router.get("/")
async def list_items():
    return []
```

## 完整 CRUD 示例

```python
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel

app = FastAPI()

class ItemCreate(BaseModel):
    name: str
    price: float
    description: str | None = None

class ItemOut(BaseModel):
    id: int
    name: str
    price: float
    description: str | None = None

# 模拟存储
db: dict[int, dict] = {}
counter = 0

@app.post("/items/", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
async def create_item(item: ItemCreate):
    global counter
    counter += 1
    record = {"id": counter, **item.model_dump()}
    db[counter] = record
    return record

@app.get("/items/", response_model=list[ItemOut])
async def list_items(skip: int = 0, limit: int = 20):
    items = list(db.values())
    return items[skip : skip + limit]

@app.get("/items/{item_id}", response_model=ItemOut)
async def get_item(item_id: int):
    if item_id not in db:
        raise HTTPException(status_code=404, detail="Item not found")
    return db[item_id]

@app.put("/items/{item_id}", response_model=ItemOut)
async def update_item(item_id: int, item: ItemCreate):
    if item_id not in db:
        raise HTTPException(status_code=404, detail="Item not found")
    record = {"id": item_id, **item.model_dump()}
    db[item_id] = record
    return record

@app.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: int):
    if item_id not in db:
        raise HTTPException(status_code=404, detail="Item not found")
    del db[item_id]
```

## 常见陷阱

- **路径声明顺序**：`/users/me` 必须在 `/users/{user_id}` 之前声明，否则 `me` 会被当作路径参数
- **Annotated 是推荐写法**：`Query(default=None)` 的旧写法仍可用，但 `Annotated[str | None, Query()]` 更清晰且可复用
- **response_model_include/exclude 是快捷方案**：官方推荐创建独立的输出模型而非用 include/exclude 过滤
- **别忘了 status_code**：POST 创建应返回 201，DELETE 应返回 204，默认都是 200
- **bool 查询参数的转换**：`?short=yes`、`?short=true`、`?short=1`、`?short=on` 都会被转为 `True`
- **model_dump() 替代 dict()**：Pydantic v2 中 `.dict()` 已弃用，使用 `.model_dump()`

## 组合提示

- 配合 **fastapi-pydantic** 深入了解模型验证、嵌套模型、自定义校验器
- 配合 **fastapi-dependencies** 为路由添加认证、权限检查等前置逻辑
- 配合 **fastapi-core** 了解 APIRouter 的模块化组织方式
- 配合 **fastapi-middleware** 处理跨路由的请求/响应拦截
