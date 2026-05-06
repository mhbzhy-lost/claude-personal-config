---
name: pytest-mock
description: Mocking and spying in pytest via the mocker fixture — thin wrapper around unittest.mock with auto-cleanup
tech_stack: [backend]
language: python
capability: [unit-testing, integration-testing]
version: "pytest-mock 3.x"
collected_at: 2025-01-01
---

# pytest-mock

> Source: https://pytest-mock.readthedocs.io/en/latest/usage.html, https://raw.githubusercontent.com/pytest-dev/pytest-mock/main/README.rst

## Purpose

Provides the `mocker` fixture — a thin wrapper around Python's `unittest.mock` that automatically undoes all patches after each test. Adds `spy` (track calls on real objects without replacing behavior), `stub` (accept-anything mock for callbacks), and scope-level mocker variants for module/class/package/session fixtures.

## When to Use

- Replacing external dependencies (APIs, filesystem, network) in unit tests
- Verifying call signatures: `assert_called_once_with(...)`, `call_count`
- Spying on real functions/methods to track usage without changing behavior
- Creating stub callbacks for event handlers
- Mocking async functions with `AsyncMock`
- Patching in module/class/session-scoped fixtures via `module_mocker` etc.

## Basic Usage

```python
import os

class UnixFS:
    @staticmethod
    def rm(filename):
        os.remove(filename)

def test_unix_fs(mocker):
    mocker.patch('os.remove')
    UnixFS.rm('file')
    os.remove.assert_called_once_with('file')
```

Everything is auto-cleaned at test teardown — no `start()`/`stop()` or context managers needed.

## Key APIs (Summary)

### Core patching (same args as `unittest.mock.patch`)

| Method | Purpose |
|--------|---------|
| `mocker.patch(target, return_value=..., side_effect=...)` | Patch any import path |
| `mocker.patch.object(obj, attr, ...)` | Patch an attribute on an object |
| `mocker.patch.multiple(target, **attrs)` | Patch multiple attributes at once |
| `mocker.patch.dict(target, values)` | Patch a dictionary (e.g., `os.environ`) |
| `mocker.stopall()` | Stop all active patches |
| `mocker.stop(obj)` | Stop a specific patch or spy |
| `mocker.resetall()` | Reset call counters on all mocks (patches stay active) |

### Convenience attributes on `mocker`

`mocker.Mock`, `mocker.MagicMock`, `mocker.PropertyMock`, `mocker.AsyncMock`, `mocker.ANY`, `mocker.DEFAULT`, `mocker.call`, `mocker.sentinel`, `mocker.mock_open`, `mocker.seal`

### Spy — track without replacing

```python
def test_spy(mocker):
    class Foo:
        def bar(self, v):
            return v * 2
    foo = Foo()
    spy = mocker.spy(foo, 'bar')
    assert foo.bar(21) == 42           # original behavior preserved
    spy.assert_called_once_with(21)
    assert spy.spy_return == 42        # last return value
    assert spy.spy_return_list == [42] # all return values
```

Spy extra attributes: `spy_return`, `spy_return_list`, `spy_exception`, `spy_return_iter`. Works on functions, methods, class/static methods, and `async def` (since 3.0.0). Use `mocker.stop(spy)` to un-spy selectively.

### Stub — accept any arguments

```python
def test_stub(mocker):
    stub = mocker.stub(name='on_something_stub')
    some_function(stub)
    stub.assert_called_once_with('foo', 'bar')
```

Also `mocker.async_stub()` for async callbacks.

### Scope-level mockers (for non-function-scoped fixtures)

```python
@pytest.fixture(scope="module")
def patched_env(module_mocker):
    module_mocker.patch.dict('os.environ', {'DATABASE_URL': 'sqlite://'})
    yield
```

| Fixture | Scope |
|---------|-------|
| `mocker` | function |
| `class_mocker` | class |
| `module_mocker` | module |
| `package_mocker` | package |
| `session_mocker` | session |

## Caveats

- **"Where to patch" rule**: Patch the name in the module *where it is used*, not where it is defined. If `app.services` does `from os import remove`, patch `app.services.remove`, not `os.remove`. This is the #1 cause of mocking not working.
- **No context-manager/decorator form**: `with mocker.patch.object(...)` emits a warning — use the fixture form directly. If unavoidable, use `mocker.patch.context_manager`.
- **`resetall()` vs `stopall()`**: `resetall()` clears call counters (patches stay active). `stopall()` removes patches entirely.
- **Scope mockers leak state**: `module_mocker` patches in a module-scoped fixture persist across all tests in that module. Ensure this is intentional.
- **Spy attribute names**: Pre-2.0 used `return_value`/`side_effect`; these were renamed to `spy_return`/`spy_exception` in 2.0+.

## Composition Hints

- **With pytest fixtures**: Use `module_mocker` inside module-scoped fixtures; use `mocker` directly in test functions.
- **With pytest-fastapi**: Patch external services, then inject via `app.dependency_overrides`.
- **With pytest-asyncio**: `mocker.AsyncMock` + `mocker.spy` on async functions work directly in `@pytest.mark.asyncio` tests.
- **With pytest-cov**: Mocked code paths count as covered — combine with coverage to verify all branches are tested.
