---
name: fastapi-pydantic
description: "Pydantic v2 模型定义、Field 约束、嵌套模型、field_validator/model_validator 自定义校验、序列化控制"
tech_stack: [fastapi]
language: [python]
---

# FastAPI Pydantic -- 数据模型与验证

> 来源：https://docs.pydantic.dev/latest/ / https://fastapi.tiangolo.com/tutorial/body/ / https://fastapi.tiangolo.com/tutorial/body-fields/
> 版本基准：FastAPI 0.115+（Pydantic v2.6+, Python 3.10+）

## 用途

使用 Pydantic v2 定义请求体和响应体的数据模型，实现自动类型转换、数据验证、序列化和 OpenAPI 文档生成。

## 何时使用

- 定义 API 的请求体 / 响应体结构
- 需要对字段施加约束（长度、范围、正则等）
- 需要跨字段联合校验（如确认密码一致）
- 需要控制序列化行为（别名、排除字段等）
- 处理嵌套 JSON 结构

## 基础模型定义

```python
from pydantic import BaseModel

class Item(BaseModel):
    name: str
    description: str | None = None
    price: float
    tax: float | None = None
    tags: list[str] = []
```

使用方式：

```python
from fastapi import FastAPI

app = FastAPI()

@app.post("/items/")
async def create_item(item: Item):
    return item
```

请求体示例：

```json
{
    "name": "Widget",
    "price": 9.99,
    "tags": ["sale", "new"]
}
```

## Field 约束

```python
from pydantic import BaseModel, Field

class Item(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=100,
        examples=["Widget"],
    )
    description: str | None = Field(
        default=None,
        max_length=500,
        title="商品描述",
        description="商品的详细描述文本",
    )
    price: float = Field(
        gt=0,                    # 大于 0
        le=999999.99,            # 小于等于
        examples=[9.99],
    )
    quantity: int = Field(
        default=1,
        ge=1,                    # 大于等于 1
        lt=10000,                # 小于
    )
    sku: str = Field(
        pattern=r"^[A-Z]{2}-\d{4}$",  # 正则约束
        examples=["AB-1234"],
    )
```

### 常用 Field 参数

| 参数 | 说明 | 适用类型 |
|------|------|----------|
| `default` | 默认值 | 所有 |
| `default_factory` | 默认值工厂函数 | 可变类型 |
| `min_length` / `max_length` | 长度约束 | str, list |
| `gt` / `ge` / `lt` / `le` | 数值范围 | int, float |
| `pattern` | 正则表达式 | str |
| `alias` | JSON 中的字段名 | 所有 |
| `title` / `description` | OpenAPI 文档 | 所有 |
| `examples` | 示例值列表 | 所有 |
| `exclude` | 序列化时排除 | 所有 |
| `deprecated` | 标记弃用 | 所有 |

## 嵌套模型

```python
from pydantic import BaseModel, HttpUrl

class Image(BaseModel):
    url: HttpUrl
    name: str
    width: int | None = None
    height: int | None = None

class Item(BaseModel):
    name: str
    price: float
    images: list[Image] = []

class Order(BaseModel):
    order_id: str
    items: list[Item]
    total: float
```

对应请求体：

```json
{
    "order_id": "ORD-001",
    "items": [
        {
            "name": "Widget",
            "price": 9.99,
            "images": [
                {"url": "https://example.com/img.png", "name": "front"}
            ]
        }
    ],
    "total": 9.99
}
```

## 自定义验证器

### field_validator -- 单字段验证

```python
from pydantic import BaseModel, field_validator

class UserCreate(BaseModel):
    username: str
    email: str
    age: int

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.isalnum():
            raise ValueError("用户名只能包含字母和数字")
        return v.lower()  # 可以转换返回值

    @field_validator("email")
    @classmethod
    def email_must_contain_at(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("邮箱格式不正确")
        return v.lower()

    @field_validator("age")
    @classmethod
    def age_must_be_positive(cls, v: int) -> int:
        if v < 0 or v > 150:
            raise ValueError("年龄必须在 0-150 之间")
        return v
```

### field_validator 的 mode 参数

```python
from pydantic import BaseModel, field_validator

class Item(BaseModel):
    price: float

    @field_validator("price", mode="before")
    @classmethod
    def parse_price(cls, v):
        """在类型转换之前运行，可处理原始输入"""
        if isinstance(v, str):
            v = v.replace(",", "").replace("$", "")
        return v

    @field_validator("price", mode="after")
    @classmethod
    def check_price(cls, v: float) -> float:
        """在类型转换之后运行（默认模式）"""
        if v <= 0:
            raise ValueError("价格必须大于 0")
        return round(v, 2)
```

### model_validator -- 跨字段验证

```python
from pydantic import BaseModel, model_validator

class UserRegister(BaseModel):
    username: str
    password: str
    password_confirm: str

    @model_validator(mode="after")
    def check_passwords_match(self):
        if self.password != self.password_confirm:
            raise ValueError("两次输入的密码不一致")
        return self

class DateRange(BaseModel):
    start_date: str
    end_date: str

    @model_validator(mode="after")
    def check_date_order(self):
        if self.start_date >= self.end_date:
            raise ValueError("开始日期必须早于结束日期")
        return self
```

### model_validator mode="before"

```python
from pydantic import BaseModel, model_validator

class FlexibleItem(BaseModel):
    name: str
    price: float

    @model_validator(mode="before")
    @classmethod
    def preprocess(cls, data):
        """在所有字段解析之前运行，接收原始输入"""
        if isinstance(data, str):
            # 支持传入简单字符串
            return {"name": data, "price": 0.0}
        return data
```

## model_config 配置

```python
from pydantic import BaseModel, ConfigDict

class Item(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,     # 自动去除字符串首尾空白
        str_min_length=1,              # 所有字符串至少 1 个字符
        from_attributes=True,          # 支持从 ORM 对象创建（替代 orm_mode）
        populate_by_name=True,         # 允许用字段名或别名赋值
        use_enum_values=True,          # 使用枚举的值而非枚举成员
        json_schema_extra={            # 追加 OpenAPI schema 信息
            "examples": [{"name": "Widget", "price": 9.99}]
        },
    )

    item_name: str = Field(alias="itemName")
    price: float
```

### 从 ORM 对象创建（from_attributes）

```python
from pydantic import BaseModel, ConfigDict

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str

# 可以从 SQLAlchemy 模型实例创建
# user_out = UserOut.model_validate(sqlalchemy_user)
```

## 序列化控制

### model_dump -- 转为字典

```python
item = Item(name="Widget", price=9.99, description=None)

# 基础
item.model_dump()
# {"name": "Widget", "price": 9.99, "description": None}

# 排除 None 值
item.model_dump(exclude_none=True)
# {"name": "Widget", "price": 9.99}

# 排除未设置的字段
item.model_dump(exclude_unset=True)
# {"name": "Widget", "price": 9.99}

# 只包含特定字段
item.model_dump(include={"name", "price"})
# {"name": "Widget", "price": 9.99}

# 使用别名作为 key
item.model_dump(by_alias=True)
```

### model_dump_json -- 转为 JSON 字符串

```python
json_str = item.model_dump_json(indent=2)
```

### computed_field -- 计算属性

```python
from pydantic import BaseModel, computed_field

class Rectangle(BaseModel):
    width: float
    height: float

    @computed_field
    @property
    def area(self) -> float:
        return self.width * self.height
```

## 模型继承模式

```python
from pydantic import BaseModel

# 共享基础字段
class ItemBase(BaseModel):
    name: str
    price: float
    description: str | None = None

# 创建时的模型（输入）
class ItemCreate(ItemBase):
    pass

# 更新时的模型（所有字段可选）
class ItemUpdate(BaseModel):
    name: str | None = None
    price: float | None = None
    description: str | None = None

# 返回时的模型（输出，带 ID）
class ItemOut(ItemBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
```

## 常见陷阱

- **Pydantic v2 与 v1 API 不兼容**：`validator` -> `field_validator`，`root_validator` -> `model_validator`，`class Config` -> `model_config = ConfigDict(...)`，`.dict()` -> `.model_dump()`
- **field_validator 必须加 @classmethod**：v2 中 `@field_validator` 下面必须跟 `@classmethod`，否则报错
- **model_validator mode="after" 用 self**：`mode="after"` 时方法签名是 `def xxx(self)`，`mode="before"` 时是 `@classmethod` 且 `def xxx(cls, data)`
- **可变默认值**：不要用 `tags: list[str] = []` 的可变默认值问题在 Pydantic 中已被处理（每次创建新列表），但仍推荐用 `Field(default_factory=list)` 明确意图
- **HttpUrl 返回 Url 对象**：Pydantic v2 中 `HttpUrl` 字段返回的是 `Url` 对象而非字符串，需要 `str(url)` 或在序列化时处理
- **from_attributes 替代 orm_mode**：Pydantic v2 中不再使用 `orm_mode = True`，改为 `from_attributes=True`

## 组合提示

- 配合 **fastapi-routing** 了解模型在请求体和响应模型中的用法
- 配合 **fastapi-auth** 定义 Token/User 相关的数据模型
- 配合 **fastapi-testing** 构造测试数据
