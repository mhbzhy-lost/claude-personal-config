---
name: fastapi-testing
description: "TestClient（httpx）同步测试、pytest fixtures、异步测试（AsyncClient）、dependency_overrides 依赖覆盖、WebSocket 测试"
tech_stack: [fastapi, backend]
language: [python]
---

# FastAPI Testing -- 测试体系

> 来源：https://fastapi.tiangolo.com/tutorial/testing/ / https://fastapi.tiangolo.com/advanced/async-tests/ / https://fastapi.tiangolo.com/advanced/testing-websockets/
> 版本基准：FastAPI 0.115+（Python 3.10+）

## 用途

使用 pytest 对 FastAPI 应用进行单元测试和集成测试，涵盖同步 TestClient、异步 AsyncClient、依赖覆盖和 WebSocket 测试。

## 何时使用

- 为 API 端点编写自动化测试
- 需要在测试中替换真实依赖（数据库、外部服务）
- 测试异步端点（需要真正的 async 执行环境）
- 测试 WebSocket 端点
- 实现 CI/CD 中的自动化测试流程

## 安装

```bash
pip install httpx     # TestClient 依赖
pip install pytest    # 测试框架
pip install anyio     # 异步测试支持（pytest-asyncio 或 anyio）
```

## 同步测试 -- TestClient

### 基础测试

```python
# app/main.py
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def read_main():
    return {"msg": "Hello World"}
```

```python
# app/test_main.py
from fastapi.testclient import TestClient
from .main import app

client = TestClient(app)

def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"msg": "Hello World"}
```

注意：测试函数使用 `def`（不是 `async def`），调用 client 方法不需要 `await`。

### 完整 CRUD 测试

```python
# app/main.py
from typing import Annotated
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

app = FastAPI()

fake_secret_token = "coneofsilence"
fake_db = {
    "foo": {"id": "foo", "title": "Foo", "description": "There goes my hero"},
    "bar": {"id": "bar", "title": "Bar", "description": "The bartenders"},
}

class Item(BaseModel):
    id: str
    title: str
    description: str | None = None

@app.get("/items/{item_id}", response_model=Item)
async def read_item(item_id: str, x_token: Annotated[str, Header()]):
    if x_token != fake_secret_token:
        raise HTTPException(status_code=400, detail="Invalid X-Token header")
    if item_id not in fake_db:
        raise HTTPException(status_code=404, detail="Item not found")
    return fake_db[item_id]

@app.post("/items/", response_model=Item)
async def create_item(item: Item, x_token: Annotated[str, Header()]):
    if x_token != fake_secret_token:
        raise HTTPException(status_code=400, detail="Invalid X-Token header")
    if item.id in fake_db:
        raise HTTPException(status_code=409, detail="Item already exists")
    fake_db[item.id] = item.model_dump()
    return item
```

```python
# app/test_main.py
from fastapi.testclient import TestClient
from .main import app

client = TestClient(app)

def test_read_item():
    response = client.get("/items/foo", headers={"X-Token": "coneofsilence"})
    assert response.status_code == 200
    assert response.json() == {
        "id": "foo",
        "title": "Foo",
        "description": "There goes my hero",
    }

def test_read_item_bad_token():
    response = client.get("/items/foo", headers={"X-Token": "wrong"})
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid X-Token header"}

def test_read_nonexistent_item():
    response = client.get("/items/baz", headers={"X-Token": "coneofsilence"})
    assert response.status_code == 404

def test_create_item():
    response = client.post(
        "/items/",
        headers={"X-Token": "coneofsilence"},
        json={"id": "foobar", "title": "Foo Bar", "description": "The Foo Barters"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "id": "foobar",
        "title": "Foo Bar",
        "description": "The Foo Barters",
    }

def test_create_existing_item():
    response = client.post(
        "/items/",
        headers={"X-Token": "coneofsilence"},
        json={"id": "foo", "title": "Dup", "description": "Duplicate"},
    )
    assert response.status_code == 409
```

## 使用 pytest fixtures

```python
import pytest
from fastapi.testclient import TestClient
from .main import app

@pytest.fixture
def client():
    """每个测试函数获得独立的 TestClient"""
    with TestClient(app) as c:
        yield c

@pytest.fixture
def auth_headers():
    return {"X-Token": "coneofsilence"}

def test_read_item(client, auth_headers):
    response = client.get("/items/foo", headers=auth_headers)
    assert response.status_code == 200

def test_create_item(client, auth_headers):
    response = client.post(
        "/items/",
        headers=auth_headers,
        json={"id": "new", "title": "New Item"},
    )
    assert response.status_code == 200
```

## dependency_overrides -- 依赖覆盖

### 基础用法

```python
# app/main.py
from typing import Annotated
from fastapi import Depends, FastAPI

app = FastAPI()

async def get_db():
    db = RealDatabase()
    try:
        yield db
    finally:
        db.close()

@app.get("/users/")
async def list_users(db: Annotated[Database, Depends(get_db)]):
    return db.get_all_users()
```

```python
# app/test_main.py
from fastapi.testclient import TestClient
from .main import app, get_db

# 替换依赖
def override_get_db():
    db = FakeDatabase()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

def test_list_users():
    response = client.get("/users/")
    assert response.status_code == 200
```

### 覆盖 Settings

```python
# app/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    admin_email: str
    app_name: str = "My App"

# app/main.py
from functools import lru_cache
from .config import Settings

@lru_cache
def get_settings():
    return Settings()

@app.get("/info")
async def info(settings: Annotated[Settings, Depends(get_settings)]):
    return {"app_name": settings.app_name}
```

```python
# app/test_main.py
from .config import Settings
from .main import app, get_settings

def get_settings_override():
    return Settings(
        admin_email="test@example.com",
        app_name="Test App",
    )

app.dependency_overrides[get_settings] = get_settings_override

def test_info():
    client = TestClient(app)
    response = client.get("/info")
    assert response.json()["app_name"] == "Test App"
```

### 使用 fixture 管理覆盖的生命周期

```python
import pytest
from fastapi.testclient import TestClient
from .main import app, get_db

@pytest.fixture
def client():
    def override_get_db():
        db = TestDatabase()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    # 清理覆盖
    app.dependency_overrides.clear()

def test_with_override(client):
    response = client.get("/users/")
    assert response.status_code == 200
```

## 异步测试 -- AsyncClient

用于需要真正异步执行环境的测试（如测试依赖中的 async 数据库操作）。

```python
# app/main.py
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Tomato"}
```

```python
# app/test_main.py
import pytest
from httpx import ASGITransport, AsyncClient
from .main import app

@pytest.mark.anyio
async def test_root():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        response = await ac.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Tomato"}
```

### 异步 fixture

```python
import pytest
from httpx import ASGITransport, AsyncClient
from .main import app

@pytest.fixture
async def async_client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

@pytest.mark.anyio
async def test_root(async_client):
    response = await async_client.get("/")
    assert response.status_code == 200
```

### conftest.py 配置

```python
# conftest.py
import pytest

# 如果使用 pytest-asyncio
# pytest.ini 或 pyproject.toml 中配置：
# [tool.pytest.ini_options]
# asyncio_mode = "auto"

# 如果使用 anyio（FastAPI 推荐）
@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"
```

## 测试 WebSocket

```python
from fastapi.testclient import TestClient
from .main import app

def test_websocket_echo():
    client = TestClient(app)
    with client.websocket_connect("/ws") as websocket:
        websocket.send_text("Hello")
        data = websocket.receive_text()
        assert data == "Echo: Hello"

def test_websocket_json():
    client = TestClient(app)
    with client.websocket_connect("/ws") as websocket:
        websocket.send_json({"type": "greeting", "content": "Hi"})
        data = websocket.receive_json()
        assert data["type"] == "response"

def test_websocket_with_query():
    client = TestClient(app)
    with client.websocket_connect("/ws?token=valid-token") as websocket:
        data = websocket.receive_text()
        assert "Welcome" in data
```

## 测试文件上传

```python
def test_upload_file():
    client = TestClient(app)
    response = client.post(
        "/upload/",
        files={"file": ("test.txt", b"file content", "text/plain")},
    )
    assert response.status_code == 200
```

## 测试 lifespan 事件

```python
def test_lifespan():
    """TestClient 作为上下文管理器使用时会触发 lifespan"""
    with TestClient(app) as client:
        # lifespan startup 已执行
        response = client.get("/predict")
        assert response.status_code == 200
    # lifespan shutdown 已执行
```

> 注意：`AsyncClient` 不会自动触发 lifespan 事件，需要使用 `asgi-lifespan` 库的 `LifespanManager`。

## 项目测试目录结构

```
app/
├── __init__.py
├── main.py
├── config.py
├── routers/
│   └── users.py
└── tests/
    ├── __init__.py
    ├── conftest.py      # 共享 fixtures
    ├── test_main.py
    └── test_users.py
```

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["app/tests"]
asyncio_mode = "auto"
```

## 常见陷阱

- **测试函数用 def 不是 async def**：使用 TestClient（同步）时，测试函数必须是普通 `def`，不能 `await`
- **dependency_overrides 是全局的**：覆盖后会影响后续所有测试，必须在测试结束后调用 `app.dependency_overrides.clear()` 或用 fixture 管理
- **AsyncClient 不触发 lifespan**：如果端点依赖 lifespan 中初始化的资源，需要额外使用 `LifespanManager`
- **TestClient 上下文管理器**：使用 `with TestClient(app) as client:` 才会触发 lifespan 事件，直接 `client = TestClient(app)` 也会，但不如显式上下文管理器可控
- **测试间状态污染**：如果应用使用全局变量（如 `fake_db`），测试之间可能互相影响。使用 fixture 重置状态或在 dependency_overrides 中提供独立数据源
- **httpx 版本兼容**：确保 httpx 版本与 FastAPI 兼容，`ASGITransport` 在 httpx 0.24+ 可用
- **anyio vs pytest-asyncio**：FastAPI 推荐使用 `@pytest.mark.anyio`，如果使用 `pytest-asyncio` 则用 `@pytest.mark.asyncio`

## 组合提示

- 配合 **fastapi-dependencies** 理解依赖覆盖的原理和最佳实践
- 配合 **fastapi-auth** 测试认证端点（覆盖 `get_current_user` 跳过认证）
- 配合 **fastapi-core** 测试 lifespan 事件和 Settings 覆盖
- 配合 **fastapi-websocket** 使用 `websocket_connect` 测试 WebSocket 端点
