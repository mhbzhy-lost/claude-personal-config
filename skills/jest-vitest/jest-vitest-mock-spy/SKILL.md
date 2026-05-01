---
name: jest-vitest-mock-spy
description: Jest/Vitest mock functions and spies — jest.fn, vi.fn, jest.mock, vi.mock, jest.spyOn, vi.spyOn, module mocking, partial mocking, and mock lifecycle (clear/reset/restore).
tech_stack: [jest-vitest]
language: [typescript, javascript]
capability: [unit-testing]
version: "Jest 30.0 / Vitest"
collected_at: 2025-01-01
---

# Jest/Vitest Mock Functions & Spies

> Source: https://jestjs.io/docs/mock-functions, https://jestjs.io/docs/mock-function-api, https://vitest.dev/guide/mocking.html, https://vitest.dev/api/vi.html

## Purpose

Mock functions ("spies") replace real implementations to capture call arguments, return values, constructor instances, and `this` contexts. They enable test-time configuration of return values and let you assert how code under test interacts with its dependencies. Two approaches: (1) standalone mock functions (`jest.fn`/`vi.fn`) injected into code, and (2) module-level mocking (`jest.mock`/`vi.mock`) to replace imports.

## When to Use

- Verify callbacks are called with correct arguments and expected number of times
- Replace API clients, databases, or filesystem modules in unit tests
- Inject specific return values or errors into code paths
- Spy on existing methods without replacing them (`jest.spyOn`/`vi.spyOn`)
- Partial mocking: keep most of a module real, mock only specific exports
- Control async outcomes: resolve/reject promises on demand
- Mock timers, dates, globals, and environment variables (Vitest: `vi.setSystemTime`, `vi.stubGlobal`, `vi.stubEnv`)

## Basic Usage

```ts
// Create a mock function (returns undefined by default)
const mockFn = vi.fn()          // Vitest
const mockFn = jest.fn()        // Jest

// With implementation
const mockFn = vi.fn(x => 42 + x)

// Inject return values
mockFn.mockReturnValue(42)
mockFn.mockReturnValueOnce('first').mockReturnValueOnce('second').mockReturnValue('default')

// Async
mockFn.mockResolvedValue({ data: [] })       // Promise.resolve
mockFn.mockRejectedValue(new Error('fail'))   // Promise.reject

// Spy on existing method
const spy = vi.spyOn(console, 'log')
const spy = jest.spyOn(obj, 'method')

// Module mocking
vi.mock('./api', () => ({ fetch: vi.fn() }))        // Vitest
jest.mock('./api', () => ({ fetch: jest.fn() }))     // Jest

// Assert on calls
expect(mockFn).toHaveBeenCalled()
expect(mockFn).toHaveBeenCalledTimes(2)
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
expect(mockFn).toHaveReturnedWith(42)
```

## Key APIs (Summary)

### Creating Mocks

| Operation | Jest | Vitest |
|-----------|------|--------|
| Create mock function | `jest.fn(impl?)` | `vi.fn(impl?)` |
| Spy on method | `jest.spyOn(obj, key)` | `vi.spyOn(obj, key)` |
| Spy on getter/setter | — | `vi.spyOn(obj, key, 'get'\|'set')` |
| Mock module | `jest.mock(path, factory?)` | `vi.mock(path, factory?)` |
| Deep mock object | — | `vi.mockObject(obj, opts?)` |

### Module Mocking (vitest differences)

`vi.mock` is **hoisted** to file top — always runs before imports. Key Vitest differences from Jest:

- **Async factory**: `vi.mock('./mod', async (importOriginal) => { const mod = await importOriginal(); return {...mod, fn: vi.fn()} })`
- **`import` only**: Not `require()`. Jest supports both.
- **Module promise syntax**: `vi.mock(import('./mod'), async (importOriginal) => ...)` for better IDE type inference
- **`{ spy: true }` option**: `vi.mock('./mod', { spy: true })` automocks but keeps original impl — just enables call assertions
- **ESM default export**: Factory must include `default` key for default exports
- **`vi.doMock`**: Non-hoisted variant; only affects subsequent dynamic imports
- **`vi.hoisted()`**: Hoist variables for use inside `vi.mock` factory

```ts
// Partial mock (Vitest)
vi.mock(import('./mod.js'), async (importOriginal) => {
  const mod = await importOriginal()
  return { ...mod, onlyThisIsMocked: vi.fn() }
})

// Partial mock (Jest)
jest.mock('../foo-bar-baz', () => {
  const originalModule = jest.requireActual('../foo-bar-baz')
  return { __esModule: true, ...originalModule, default: jest.fn(() => 'mocked') }
})

// Spy-mode automock (Vitest only)
vi.mock('./src/calculator.ts', { spy: true })
// calls real implementation, but allows asserting on it
```

### `.mock` Inspection Properties

| Property | Content |
|----------|---------|
| `.mock.calls` | `[['arg1','arg2'], ['arg3','arg4']]` — arguments per call |
| `.mock.results` | `[{type:'return',value:42}, {type:'throw',value:Error}]` |
| `.mock.instances` | Objects created via `new mockFn()` |
| `.mock.contexts` | `this` value per call |
| `.mock.lastCall` | Arguments of last call; `undefined` if never called |

### Mock Lifecycle (escalating severity)

| Method | Clears history | Resets impl | Restores original |
|--------|:---:|:---:|:---:|
| `.mockClear()` | ✓ | — | — |
| `.mockReset()` | ✓ | ✓ | — |
| `.mockRestore()` | ✓ | ✓ | ✓ (spyOn only!) |

Global variants: `vi.clearAllMocks()` / `vi.resetAllMocks()` / `vi.restoreAllMocks()`. Config options: `clearMocks`, `resetMocks`, `restoreMocks`.

### Setting Behavior (chainable)

| Method | Effect |
|--------|--------|
| `.mockReturnValue(v)` | Always return `v` |
| `.mockReturnValueOnce(v)` | Return `v` once, then fall through |
| `.mockResolvedValue(v)` | `Promise.resolve(v)` |
| `.mockRejectedValue(e)` | `Promise.reject(e)` |
| `.mockImplementation(fn)` | Call `fn` (records calls) |
| `.mockImplementationOnce(fn)` | Call `fn` once, fall through to default |
| `.mockReturnThis()` | Return `this` (for fluent/chaining APIs) |
| `.mockName('label')` | Display name in test error output |
| `.withImplementation(fn, callback)` | Temporary impl; auto-restores after callback |

### Built-in Call Assertion Matchers

`.toHaveBeenCalled()`, `.toHaveBeenCalledTimes(n)`, `.toHaveBeenCalledWith(...args)`, `.toHaveBeenLastCalledWith(...args)`, `.toHaveBeenNthCalledWith(n, ...args)`, `.toHaveReturned()`, `.toHaveReturnedTimes(n)`, `.toHaveReturnedWith(v)`, `.toHaveLastReturnedWith(v)`, `.toHaveNthReturnedWith(n, v)`.

### Vitest-Specific Extras

- **`vi.mockObject(obj, { spy?: true })`** — deep mock all properties/methods of a plain object
- **`vi.isMockFunction(fn)`** — type guard
- **`vi.stubGlobal(name, value)`** / **`vi.unstubAllGlobals()`** — stub global variables
- **`vi.stubEnv(name, value)`** / **`vi.unstubAllEnvs()`** — stub env vars (auto-reset with `unstubEnvs` config)
- **`vi.setSystemTime(date)`** / **`vi.useRealTimers()`** — mock current date
- **`vi.resetModules()`** — clear module cache (next dynamic import re-evaluates)
- **`vi.dynamicImportSettled()`** — await all pending dynamic imports

## Caveats

- **`mockRestore()` only works with `spyOn`**: `jest.fn()`/`vi.fn()` mocks won't restore. Manage manually.
- **`mockClear()` replaces the `.mock` object**: Don't cache `.mock` reference — it becomes stale.
- **`vi.restoreAllMocks()` skips automocks**: Only affects `vi.spyOn`. Automocked modules (bare `vi.mock('./mod')`) are NOT restored.
- **`vi.spyOn` fails in Browser Mode**: Use `vi.mock('./file.js', { spy: true })` as workaround.
- **`vi.mock` only works with `import`**: `require()` is not supported by Vitest.
- **Hoisting trap**: Variables in `vi.mock` factory must come from `vi.hoisted()` or be defined inside the factory.
- **Partial mock internal calls**: If module function `A` calls module function `B` internally, mocking `B` won't affect `A`'s internal call.
- **`vi.doMock` vs static imports**: Static imports are evaluated before `vi.doMock` — they won't see the mock.
- **Arrow functions in class mocks**: `vi.spyOn(Obj, 'ClassProp').mockImplementation(() => {...})` fails with "not a constructor". Use `function` or `class` keyword.
- **Always clean up**: Use `afterEach` + `vi.clearAllMocks()` or config options (`clearMocks`/`resetMocks`) to prevent cross-test contamination.

## Composition Hints

- Pair with **jest-vitest-assertions** for `.toHaveBeenCalled` matchers and deep equality on mock arguments
- Pair with **jest-vitest-async** for mocking async functions with `mockResolvedValue`/`mockRejectedValue` + fake timers
- Pair with **jest-vitest-test-organization** for `beforeEach` mock reset strategies and scoping rules
- Pair with **jest-vitest-api-testing** for MSW/supertest integration (complementary to module mocking for HTTP)
- Use `vi.mock(import('./mod'), ...)` syntax in Vitest for automatic path updates when files move
