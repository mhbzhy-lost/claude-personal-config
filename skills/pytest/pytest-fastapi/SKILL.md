---
name: pytest-fastapi
description: Integration testing of FastAPI endpoints using TestClient (httpx-based, in-process, no server needed)
tech_stack: [fastapi]
language: python
capability: [integration-testing, web-framework, http-client]
version: "FastAPI / Starlette TestClient unversioned"
collected_at: 2025-01-01
---

# FastAPI TestClient (pytest)

> Source: https://fastapi.tiangolo.com/tutorial/testing/, https://docs.pytest.org/en/stable/how-to/fixtures.html

## Purpose

Test FastAPI HTTP endpoints in-process using `TestClient` — a wrapper around HTTPX that talks to your FastAPI app through Starlette's ASGI transport without opening a real network socket. Test functions are plain `def` (not `async def`) and call the client synchronously, so standard pytest works without `pytest-asyncio`.

## When to Use

- Functional/integration testing of FastAPI route handlers (GET, POST, PUT, DELETE, PATCH)
- Validating HTTP status codes, response JSON bodies, headers, and cookies
- Testing error paths: 400, 404, 409, 422 responses
- Swapping real dependencies with `app.dependency_overrides` during tests
- Any scenario where you need HTTP-level assertions without starting a real server

## Basic Usage

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()

@app.get("/")
async def read_main():
    return {"msg": "Hello World"}

client = TestClient(app)

def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"msg": "Hello World"}
```

### Project layout for separate test files

```
app/
├── __init__.py
├── main.py          # app = FastAPI()
└── test_main.py     # from .main import app
```

### TestClient fixture (recommended)

```python
# conftest.py
import pytest
from fastapi.testclient import TestClient
from .main import app

@pytest.fixture
def client():
    return TestClient(app)
```

## Key APIs (Summary)

| API | Purpose |
|-----|---------|
| `TestClient(app)` | Create client wrapping your FastAPI app |
| `client.get(url, headers=..., params=..., cookies=...)` | GET request |
| `client.post(url, json=..., data=..., headers=...)` | POST; use `json=` for dict body, `data=` for form data |
| `client.put(url, ...)` / `client.patch(url, ...)` / `client.delete(url, ...)` | Other HTTP methods |
| `response.status_code` | HTTP status (int) |
| `response.json()` | Parse JSON response body |
| `response.text` / `response.headers` / `response.cookies` | Raw body, headers, cookies |
| `app.dependency_overrides[dep] = override` | Replace a dependency with a test double |
| `jsonable_encoder(pydantic_model)` | Convert Pydantic model to JSON-safe dict for `json=` |

### Request parameter quick reference

- **Path/query params**: embed in URL string (`f"/items/{id}?q=search"`)
- **JSON body**: `json={"key": "value"}` (dict, not Pydantic model)
- **Form data**: `data={"key": "value"}`
- **Headers**: `headers={"X-Token": "..."}`
- **Cookies**: `cookies={"session": "..."}`

## Caveats

- **Sync test functions only**: Use `def`, not `async def`. TestClient handles FastAPI async routes internally. If you need `await` for other async operations (DB calls), use `httpx.AsyncClient` + `pytest-asyncio`.
- **No Pydantic models in `json=`**: TestClient expects JSON-serializable data. Use `jsonable_encoder()` to convert Pydantic models to dicts.
- **State isolation**: TestClient is stateful — each request mutates the same app instance. Use function-scoped fixtures for isolation; module-scoped fixtures share state across tests.
- **dependency_overrides are sticky**: `app.dependency_overrides` persists on the app object. Clear overrides between tests (`app.dependency_overrides.clear()`) or use a fresh app per test.
- **In-process only**: No actual network socket is opened — all communication goes through ASGI in-memory. This is fast but means you aren't testing real network behavior, middleware ordering at the server level, or ASGI server quirks.

## Composition Hints

- **With pytest fixtures**: Create a `client` fixture (function-scoped for isolation, module-scoped for speed). Use `conftest.py` to share across test modules.
- **With pytest-mock**: Use `mocker` to patch external services your FastAPI dependencies call, then use `dependency_overrides` to inject the mocked versions.
- **With pytest-asyncio**: If your test needs `await` for async setup (e.g., creating test DB records), use `@pytest.mark.asyncio` + `httpx.AsyncClient` instead of the sync TestClient.
- **With pytest-parametrize**: Combine `@pytest.mark.parametrize` with TestClient to test multiple input/output combinations for a single endpoint.
- **With pytest-coverage**: `pytest --cov=myapp` works directly — TestClient calls route through your app code normally.
