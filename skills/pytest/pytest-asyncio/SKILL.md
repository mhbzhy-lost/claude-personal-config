---
name: pytest-asyncio
description: pytest-asyncio plugin — write async def tests with await, auto mode, async fixtures with yield, and configurable event loop scopes.
tech_stack: [python]
language: python
capability: [unit-testing, integration-testing]
version: "pytest-asyncio 0.21.x+ (stable)"
collected_at: 2025-01-01
---

# Pytest Asyncio

> Source: https://pytest-asyncio.readthedocs.io/en/stable/, https://github.com/pytest-dev/pytest-asyncio

## Purpose

pytest-asyncio is a pytest plugin that allows `async def` test functions and `async def` fixtures. It runs each test inside an asyncio event loop so you can `await` coroutines directly in tests. It supports configurable event loop scopes (function/class/module/package/session) and an "auto" mode that detects `async def` tests automatically.

## When to Use

- Testing `async def` functions, coroutines, and asyncio-based code
- Testing async libraries: aiohttp, asyncpg, httpx.AsyncClient, motor, etc.
- Writing async fixtures that need `await` for setup/teardown
- Testing FastAPI/Starlette endpoints with async handlers
- Any test that needs to `await` inside the test body

## Basic Usage

### Install

```bash
pip install pytest-asyncio
```

### Marking Tests (strict mode, default)

```python
import pytest

@pytest.mark.asyncio
async def test_fetch():
    result = await my_async_function()
    assert result == "expected"
```

### Auto Mode (0.17+)

In `pytest.ini` or `pyproject.toml`:

```ini
[pytest]
asyncio_mode = auto
```

Then `async def` tests work **without** the decorator:

```python
# No @pytest.mark.asyncio needed
async def test_something():
    result = await some_coroutine()
    assert result
```

Modes:
- `strict` (default): only `@pytest.mark.asyncio`-marked tests are async
- `auto`: all `async def` test functions are treated as asyncio

### Async Fixtures

```python
import pytest

@pytest.fixture
async def db():
    conn = await create_connection()
    yield conn
    await conn.close()

@pytest.mark.asyncio
async def test_query(db):
    rows = await db.fetch("SELECT 1")
    assert rows[0][0] == 1
```

Async fixtures support all standard fixture features: scope, autouse, dependency chaining, and parametrization.

### Mixing Sync and Async Fixtures

```python
@pytest.fixture
def config():                    # sync — runs before event loop
    return {"url": "http://..."}

@pytest.fixture
async def client(config):       # async — runs inside event loop
    c = AsyncClient(base_url=config["url"])
    yield c
    await c.aclose()

@pytest.mark.asyncio
async def test_api(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
```

Sync fixtures execute first (outside the event loop), then async fixtures run inside it.

## Key APIs (Summary)

| API / Config | Purpose |
|---|---|
| `@pytest.mark.asyncio` | Mark a test function as async (strict mode) |
| `asyncio_mode = auto` | Auto-detect `async def` tests (no decorator needed) |
| `asyncio_default_fixture_loop_scope` | Set default event loop scope for fixtures |
| `@pytest.fixture` (on `async def`) | Define an async fixture with `await` support |
| `loop_scope` per-fixture | Override event loop scope for a specific async fixture |

## Event Loop Scopes

Configure the default scope:

```ini
[pytest]
asyncio_default_fixture_loop_scope = function
```

| Scope | Behavior |
|---|---|
| `function` | New event loop per test (default). Best isolation. |
| `class` | Shared loop across a test class |
| `module` | Shared loop across a test module |
| `package` | Shared loop across a package |
| `session` | Single event loop for entire test run. Fastest, least isolation. |

Set per-fixture (pytest-asyncio 0.23+):

```python
@pytest.fixture(scope="module")
async def db_pool():
    async with create_pool() as pool:
        yield pool
```

The fixture's `scope` and the event loop scope must be compatible. A `session`-scoped async fixture needs a `session`-scoped event loop.

## Caveats

- **unittest.TestCase subclasses are not supported.** Use `unittest.IsolatedAsyncioTestCase` or pure pytest.
- **Event loop scope must be ≥ fixture scope.** A `session`-scoped async fixture with `function`-scoped event loop will error. Set `asyncio_default_fixture_loop_scope = session` or match scopes.
- **`asyncio_mode = auto` affects all `async def` functions** in the project — including ones you may not intend as tests.
- **Async fixtures can only be requested by async tests** (or by other async fixtures). A sync test cannot request an async fixture.
- **Default `function`-scoped event loop means each test gets a fresh loop** — good for isolation, but slower for many small tests.

## Composition Hints

### Testing with httpx.AsyncClient

```python
import httpx
import pytest

@pytest.fixture
async def client():
    async with httpx.AsyncClient(base_url="http://test") as c:
        yield c

@pytest.mark.asyncio
async def test_endpoint(client):
    resp = await client.get("/api/items")
    assert resp.status_code == 200
```

### Async + Parametrize

```python
@pytest.mark.parametrize("path,expected", [
    ("/health", 200),
    ("/admin", 403),
])
@pytest.mark.asyncio
async def test_routes(client, path, expected):
    resp = await client.get(path)
    assert resp.status_code == expected
```

### asyncio.gather for Concurrent Test Steps

```python
@pytest.mark.asyncio
async def test_concurrent_requests(client):
    tasks = [client.get(f"/item/{i}") for i in range(10)]
    responses = await asyncio.gather(*tasks)
    assert all(r.status_code == 200 for r in responses)
```

### Session-Scoped Event Loop (for expensive setup)

```ini
[pytest]
asyncio_default_fixture_loop_scope = session
```

```python
@pytest.fixture(scope="session")
async def db_pool():
    pool = await asyncpg.create_pool(...)
    yield pool
    await pool.close()
```
