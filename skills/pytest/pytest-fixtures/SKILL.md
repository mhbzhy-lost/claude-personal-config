---
name: pytest-fixtures
description: pytest fixture system — define, request, scope, and teardown test dependencies with yield, addfinalizer, autouse, and conftest.py hierarchy.
tech_stack: [python]
language: python
capability: [unit-testing, integration-testing]
version: "pytest 8.x+ (stable)"
collected_at: 2025-01-01
---

# Pytest Fixtures

> Source: https://docs.pytest.org/en/stable/how-to/fixtures.html, https://docs.pytest.org/en/stable/reference/fixtures.html

## Purpose

pytest fixtures are the core dependency-injection mechanism for test setup and teardown. Instead of `setUp`/`tearDown` methods, pytest uses `@pytest.fixture`-decorated functions that tests request by name as parameters. Fixtures compose via dependency chains, cache their return values per-test (or per-scope), and support automatic cleanup via `yield` or `request.addfinalizer`.

## When to Use

- Any test that needs repeated setup: database connections, API clients, temp files, test data
- Managing resource lifecycle: acquire → use → release
- Sharing expensive setup across multiple tests via `scope`
- Overriding fixtures in subdirectories via `conftest.py`
- Applying global preconditions to many tests via `autouse=True`

## Basic Usage

### Defining and Requesting

```python
import pytest

@pytest.fixture
def db():
    conn = connect()
    yield conn          # test runs here
    conn.close()        # teardown

def test_query(db):     # request by parameter name
    assert db.execute("SELECT 1") == 1
```

### Scope

Control how often a fixture is created:

```python
@pytest.fixture(scope="module")   # once per module
def expensive_resource():
    return setup()
```

Scopes (narrowest → widest): `function` (default), `class`, `module`, `package`, `session`.

Pytest caches only **one instance per scope**. Higher-scoped fixtures execute before lower-scoped ones.

### Dynamic Scope

```python
def determine_scope(fixture_name, config):
    return "session" if config.getoption("--keep") else "function"

@pytest.fixture(scope=determine_scope)
def container():
    yield start_container()
```

### Autouse

```python
@pytest.fixture(autouse=True)
def reset_db():
    db.truncate()      # runs for every test in scope, no request needed
```

## Key APIs (Summary)

| Fixture / Object | Purpose |
|---|---|
| `@pytest.fixture(scope, autouse, params, ids, name)` | Define a fixture |
| `request.fixturename` | Name of current fixture |
| `request.param` | Current value when fixture is parametrized |
| `request.addfinalizer(callable)` | Register teardown (alternative to yield) |
| `request.getfixturevalue(name)` | Dynamically request another fixture |
| `request.config` | Access pytest config |
| `tmp_path` | Built-in: `pathlib.Path` to a per-test temp dir |
| `tmp_path_factory` | Built-in: session-scoped temp dir factory |
| `monkeypatch` | Built-in: patch attrs, dicts, env vars |
| `capsys` / `caplog` | Built-in: capture stdout/stderr/logs |

## Caveats

- **Only one fixture instance cached per scope.** Parametrized fixtures may execute multiple times in the same scope.
- **`yield` before setup is done = teardown skipped.** If a yield fixture raises *before* `yield`, pytest runs teardown only for fixtures that already completed.
- **`addfinalizer` fires even on fixture error** — only register it after the setup that needs teardown.
- **Fixture search goes upward only.** A test in `tests/sub/` finds fixtures in `tests/conftest.py` but not vice versa. First match wins (closest definition overrides).
- **Third-party plugin fixtures are searched last.**
- **Autouse affects every reachable test** — can cause surprising side effects.
- **Execution order depends ONLY on scope, dependencies, and autouse** — never on definition order or parameter order. Use explicit dependencies if order matters.
- **Prefer `tmp_path` over `tmpdir`** — the latter is legacy `py.path.local`.

## Composition Hints

### conftest.py Hierarchy

```
tests/
├── conftest.py          # session-wide fixtures
├── test_auth.py
└── billing/
    ├── conftest.py      # billing-specific overrides
    └── test_invoice.py
```

Each level adds/overrides fixtures. Tests see the nearest definition.

### Fixture Dependencies Chain

```python
@pytest.fixture
def config():
    return load_config()

@pytest.fixture
def client(config):
    return APIClient(config.base_url)

@pytest.fixture
def auth_headers(config):
    return {"Authorization": f"Bearer {config.token}"}

def test_api(client, auth_headers):
    resp = client.get("/me", headers=auth_headers)
    assert resp.status_code == 200
```

### Factory-as-Fixture Pattern

```python
@pytest.fixture
def make_user(db):
    """Return a factory, not an instance — caller controls params."""
    created = []

    def _make(name, email):
        user = db.insert_user(name, email)
        created.append(user)
        return user

    yield _make
    for user in created:
        db.delete_user(user)

def test_multiple_users(make_user):
    u1 = make_user("alice", "a@x.com")
    u2 = make_user("bob", "b@x.com")
    assert u1.id != u2.id
```

### Override Fixture in Subdirectory

```python
# tests/conftest.py
@pytest.fixture
def db():
    return connect_to("test-db")

# tests/slow/conftest.py — overrides for this subtree only
@pytest.fixture
def db():
    return connect_to("slow-test-db")
```
