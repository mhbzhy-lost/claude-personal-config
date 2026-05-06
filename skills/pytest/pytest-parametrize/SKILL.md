---
name: pytest-parametrize
description: pytest test parametrization — @pytest.mark.parametrize, pytest.param, stacking for combinatorial coverage, and dynamic generation via pytest_generate_tests.
tech_stack: [python]
language: python
capability: [unit-testing]
version: "pytest 8.x+ (stable)"
collected_at: 2025-01-01
---

# Pytest Parametrize

> Source: https://docs.pytest.org/en/stable/how-to/parametrize.html

## Purpose

`@pytest.mark.parametrize` runs the same test function multiple times with different argument sets. It eliminates copy-paste test duplication, enables systematic edge-case coverage, and supports combinatorial (cartesian-product) testing via stacked decorators. For dynamic scenarios, the `pytest_generate_tests` hook allows generating parameters at collection time from CLI args, config files, or external data.

## When to Use

- Running identical assertions against multiple input/expected-output pairs
- Systematic boundary-value and edge-case testing
- Combinatorial coverage: cross-product of multiple parameter dimensions
- Different expected behaviors per case via `pytest.param(..., marks=...)`
- Dynamic parameter generation from CLI flags, YAML/JSON files, or databases

## Basic Usage

### Function-Level

```python
import pytest

@pytest.mark.parametrize("a,b,expected", [
    (1, 2, 3),
    (0, 0, 0),
    (-1, 1, 0),
])
def test_add(a, b, expected):
    assert a + b == expected
```

Each tuple produces one test case. Test IDs are auto-generated from the values.

### Custom IDs

```python
@pytest.mark.parametrize(
    "a,b,expected",
    [(1, 2, 3), (0, 0, 0), (-1, 1, 0)],
    ids=["positive", "zero", "negative"],
)
def test_add(a, b, expected): ...
```

Or pass a callable: `ids=lambda val: f"input={val}"`.

### Per-Case Marks with pytest.param

```python
@pytest.mark.parametrize("n,expected", [
    (1, 2),
    (3, 4),
    pytest.param(6, 42, marks=pytest.mark.xfail),
    pytest.param(0, 0, marks=pytest.mark.skip(reason="NYI")),
])
def test_increment(n, expected):
    assert n + 1 == expected
```

### Stacked Parametrize (Cartesian Product)

```python
@pytest.mark.parametrize("user_role", ["admin", "member", "guest"])
@pytest.mark.parametrize("resource", ["reports", "dashboard"])
def test_access(user_role, resource):
    ...  # runs 3×2 = 6 times
```

The **innermost** (bottom) decorator is exhausted first: `(admin, reports)`, `(admin, dashboard)`, `(member, reports)`, …

### Class-Level

```python
@pytest.mark.parametrize("n,expected", [(1, 2), (3, 4)])
class TestIncrement:
    def test_positive(self, n, expected):
        assert n + 1 == expected

    def test_double(self, n, expected):
        assert (n * 1) + 1 == expected
```

Every test method in the class receives every parameter set.

### Module-Level

```python
import pytest
pytestmark = pytest.mark.parametrize("env", ["staging", "production"])
```

### Indirect Parametrization

Pass parameters to a fixture instead of the test directly:

```python
@pytest.fixture
def db_connection(request):
    conn = connect(request.param)
    yield conn
    conn.close()

@pytest.mark.parametrize("db_connection", ["postgres", "mysql"], indirect=True)
def test_query(db_connection):
    ...
```

## Key APIs (Summary)

| API | Purpose |
|---|---|
| `@pytest.mark.parametrize(argnames, argvalues, indirect, ids, scope)` | Decorate test function/class |
| `pytest.param(*values, marks=(), id=None)` | Single parameter set with per-case marks |
| `metafunc.parametrize(...)` | Dynamic parametrization inside `pytest_generate_tests` |
| `metafunc.fixturenames` | Set of fixture names the test requests |
| `metafunc.config.getoption(name)` | Read CLI option value |
| `pytestmark = pytest.mark.parametrize(...)` | Module-level parametrization |

## Dynamic Parametrization: pytest_generate_tests

```python
# conftest.py
def pytest_addoption(parser):
    parser.addoption("--env", action="store", default="dev")

def pytest_generate_tests(metafunc):
    if "env" in metafunc.fixturenames:
        envs = metafunc.config.getoption("--env").split(",")
        metafunc.parametrize("env", envs)
```

`pytest_generate_tests` can live in a test module or class directly — unlike most other hooks.

## Caveats

- **Values are passed by reference, not copied.** Mutating a list/dict parameter in one test case leaks to subsequent cases. Use copies if mutation is needed.
- **Empty parameter list → test skipped.** Control this with `empty_parameter_set_mark` in config.
- **Non-ASCII in test IDs is escaped by default.** Enable raw unicode with `disable_test_id_escaping_and_forfeit_all_rights_to_community_support` — risky on some OS/plugin combos.
- **Duplicate argnames across multiple `metafunc.parametrize` calls raise an error.**
- **Stacking order matters** — the last decorator (closest to `def`) is exhausted first.

## Composition Hints

### Parametrize + Fixtures

```python
@pytest.fixture
def client():
    return TestClient(app)

@pytest.mark.parametrize("endpoint,expected_status", [
    ("/health", 200),
    ("/admin", 403),
])
def test_endpoints(client, endpoint, expected_status):
    resp = client.get(endpoint)
    assert resp.status_code == expected_status
```

### Filtering with -k

Parametrized test IDs are `test_name[value1-value2-...]`. Select specific cases:

```bash
pytest -k "test_add[positive]"          # exact match
pytest -k "test_add[1-2]"               # value match
pytest -k "test_add and not negative"    # exclude
```

### Combining Indirect with Direct

```python
@pytest.mark.parametrize("db_connection", ["pg", "mysql"], indirect=True)
@pytest.mark.parametrize("query,expected", [("SELECT 1", 1)])
def test_query(db_connection, query, expected):
    ...
```

`db_connection` routes through the fixture; `query` and `expected` go directly to the test.
