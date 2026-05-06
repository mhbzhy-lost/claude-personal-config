---
name: pytest-conftest
description: Organize pytest fixtures, hooks, and configuration across directory hierarchies using conftest.py
tech_stack: [pytest]
language: [python]
capability: [unit-testing, integration-testing]
version: "pytest 9.x"
collected_at: 2025-07-18
---

# pytest conftest.py — Directory-Scoped Fixture & Plugin Organization

> Source: https://docs.pytest.org/en/stable/reference/fixtures.html, https://docs.pytest.org/en/stable/how-to/fixtures.html

## Purpose

`conftest.py` is pytest's mechanism for sharing fixtures, hooks, and configuration across multiple test modules within a directory — without any imports. Each directory in a test tree can have its own `conftest.py`, forming a layered hierarchy where child directories inherit from parents and can selectively override.

## When to Use

- Sharing fixtures across multiple test files in the same directory
- Overriding fixtures per sub-package (e.g., different DB URLs for `tests/unit/` vs `tests/integration/`)
- Registering directory-scoped pytest hooks (`pytest_addoption`, `pytest_generate_tests`, `pytest_configure`)
- Defining session/package/module-scoped fixtures for expensive setup (databases, Docker containers, API clients)
- Keeping test files clean by extracting all setup into `conftest.py`

## Basic Usage

### The layered conftest model

```
tests/
├── conftest.py          # root: fixtures available everywhere
├── test_auth.py
├── unit/
│   ├── conftest.py      # unit-only fixtures; can override root fixtures
│   └── test_core.py
└── integration/
    ├── conftest.py      # integration-only fixtures
    └── test_api.py
```

Fixtures are discovered **upward only**: a test in `tests/unit/test_core.py` sees fixtures from `tests/unit/conftest.py` and `tests/conftest.py`, but never from `tests/integration/conftest.py`.

The **first fixture found wins** — defining a fixture with the same name in a closer `conftest.py` silently overrides the parent's version.

### Root conftest with session-scoped fixture

```python
# tests/conftest.py
import pytest
import psycopg2

@pytest.fixture(scope="session")
def db():
    conn = psycopg2.connect("dbname=test user=postgres")
    yield conn
    conn.close()

@pytest.fixture
def cursor(db):
    cur = db.cursor()
    yield cur
    cur.close()
```

### Overriding fixtures per subdirectory

```python
# tests/conftest.py
@pytest.fixture
def api_base():
    return "https://api.example.com"

# tests/integration/conftest.py
@pytest.fixture
def api_base():
    return "http://localhost:8000"   # overrides root for integration tests
```

### conftest as local plugin: custom CLI options

```python
# tests/conftest.py
def pytest_addoption(parser):
    parser.addoption("--env", default="dev", choices=["dev", "staging", "prod"])

@pytest.fixture(scope="session")
def env_config(request):
    env = request.config.getoption("--env")
    return {"dev": {...}, "staging": {...}, "prod": {...}}[env]
```

### Dynamic fixture parametrization via hook

```python
# tests/conftest.py
def pytest_generate_tests(metafunc):
    if "backend" in metafunc.fixturenames:
        metafunc.parametrize("backend", ["sqlite", "postgresql", "mysql"])
```

## Key APIs (Summary)

| Item | Role |
|---|---|
| `@pytest.fixture(scope=..., autouse=...)` | Define a fixture; `scope` = `function`/`class`/`module`/`package`/`session` or a callable |
| `request` fixture | Introspect the requesting test: `request.config`, `request.param`, `request.addfinalizer(fn)` |
| `pytestconfig` fixture | Access full pytest config, plugin manager, and all CLI options |
| `tmp_path_factory` fixture | Session-scoped temp-dir factory (use in session-scoped fixtures; `tmp_path` is function-scoped) |
| `pytest_addoption(parser)` | Hook for adding CLI flags — works in any `conftest.py` |
| `pytest_generate_tests(metafunc)` | Hook for dynamic parametrization — `metafunc.parametrize(...)` |
| `pytest_configure(config)` / `pytest_sessionstart(session)` | Lifecycle hooks for setup before any tests run |

### Scope resolution order (high → low)

`session` → `package` → `module` → `class` → `function`

Higher-scoped fixtures execute first. Within the same scope, dependencies determine order: if fixture A names fixture B as a parameter, B runs first.

## Caveats

- **Upward-only discovery**: a test cannot see fixtures from sibling or child `conftest.py` files.
- **Silent override**: same-named fixtures in nearer scopes shadow parent ones with no warning.
- **Autouse propagation**: when an autouse fixture depends on a non-autouse fixture, that dependency becomes effectively autouse within the autouse fixture's scope — but not globally.
- **Heavy imports slow collection**: module-level imports in `conftest.py` are executed at collection time for every test in that directory.
- **Third-party plugin fixtures are searched last**: local `conftest.py` fixtures always take priority over identically-named plugin fixtures.
- **Only one fixture instance cached per scope**: parametrized fixtures may be invoked multiple times within the declared scope.
- **Execution order is determined solely by scope, dependencies, and autouse** — definition order, name, and request order have no guaranteed effect.

## Composition Hints

- Place the **most general fixtures** in the root `tests/conftest.py` and **specialize** in subdirectory `conftest.py` files via override.
- Use **session-scoped fixtures** in root `conftest.py` for global resources (DB pools, Docker containers); use **function-scoped fixtures** for per-test isolation.
- Extract **CLI options** into a dedicated `conftest.py` near the project root so all subdirectories inherit them.
- For **dynamic parametrization** that applies across many test modules, use `pytest_generate_tests` in a `conftest.py` rather than decorating every test function with `@pytest.mark.parametrize`.
- Use `yield` fixtures (not `addfinalizer`) for teardown — they're clearer and the standard pattern. Use `addfinalizer` only when teardown registration must happen conditionally mid-fixture.
- When tests need both a shared resource and isolation, pair a session-scoped "factory" fixture with a function-scoped "ephemeral" fixture that creates per-test objects from it.
