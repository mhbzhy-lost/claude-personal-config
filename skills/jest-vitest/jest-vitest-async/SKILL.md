---
name: jest-vitest-async
description: Testing asynchronous code, fake timers, and mocking with vi utilities in Jest and Vitest
tech_stack: [jest-vitest]
language: [typescript, javascript]
capability: [unit-testing]
version: "Jest 30.0 / Vitest unversioned"
collected_at: 2025-01-01
---

# Async Testing & Mocking in Jest/Vitest

> Source: https://jestjs.io/docs/asynchronous, https://jestjs.io/docs/timer-mocks, https://vitest.dev/guide/mocking, https://vitest.dev/api/vi

## Purpose
Handle the four async test patterns (promises, async/await, callbacks, `.resolves`/`.rejects`), control fake timers to test `setTimeout`/`setInterval`/`requestAnimationFrame` without real waiting, and create mock functions, spies, and module mocks with Vitest's `vi` utilities.

## When to Use
- Any test that involves promises, async/await, or callback-based APIs
- Code using `setTimeout`, `setInterval`, or `requestAnimationFrame` that you want to test without real delays
- Replacing real implementations with mocks/spies for isolation
- Stubbing globals, dates, or environment variables in Vitest

## Basic Usage

### Async Patterns — Four Ways

**1. Return a promise** — simplest, Jest/Vitest waits for resolution:
```ts
test('fetches data', () => {
  return fetchData().then(data => expect(data).toBe('peanut butter'));
});
```

**2. async/await** — most readable for complex flows:
```ts
test('fetches data', async () => {
  const data = await fetchData();
  expect(data).toBe('peanut butter');
});
```

**3. `.resolves` / `.rejects`** — concise one-liners:
```ts
test('fetches data', () => {
  return expect(fetchData()).resolves.toBe('peanut butter');
});
test('fetch fails', () => {
  return expect(fetchData()).rejects.toMatch('error');
});
```

**4. `done` callback** — only for callback-based APIs (not promises):
```ts
test('callback data', done => {
  fetchData((error, data) => {
    if (error) return done(error);
    try {
      expect(data).toBe('peanut butter');
      done();
    } catch (e) { done(e); }
  });
});
```

> **Critical rule**: Always `return` or `await` the promise. Omitting it makes the test pass before async work completes. Never mix `done` and returning a promise — the runner throws.

### Fake Timers — Four Control Methods

Enable: `jest.useFakeTimers()` / `vi.useFakeTimers()`. Restore: `jest.useRealTimers()` / `vi.useRealTimers()`.

| Method | When to use |
|--------|------------|
| `jest.runAllTimers()` | All timers are finite, no recursion |
| `jest.runOnlyPendingTimers()` | Recursive timers (timer creates new timer) |
| `jest.advanceTimersByTime(ms)` | Need to advance a specific duration |
| `jest.advanceTimersToNextFrame()` | Testing `requestAnimationFrame` callbacks |

```ts
beforeEach(() => jest.useFakeTimers());

test('callback fires after 1s', () => {
  const cb = jest.fn();
  timerGame(cb);
  expect(cb).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1000);
  expect(cb).toHaveBeenCalledTimes(1);
});
```

Selective faking — keep real implementations for specific APIs:
```ts
jest.useFakeTimers({ doNotFake: ['performance'] });
```

### Mocking with `vi` — Three Core Functions

**`vi.fn(impl?)`** — Standalone mock function:
```ts
const fn = vi.fn(() => 42);
fn();
expect(fn).toHaveReturnedWith(42);
fn.mockReturnValueOnce(99);          // next call only
fn.mockReturnValue(100);             // all subsequent calls
```

**`vi.spyOn(obj, method)`** — Spy on existing method, optionally replace:
```ts
const spy = vi.spyOn(cart, 'getApples').mockImplementation(() => 0);
expect(cart.getApples()).toBe(0);
expect(spy).toHaveBeenCalled();
// Restore: spy.mockRestore() or vi.restoreAllMocks()
```

**`vi.mock(path, factory?)`** — Substitute an entire module. **Hoisted** to file top — executed before imports:
```ts
vi.mock('./api.ts', () => ({
  fetchData: vi.fn().mockResolvedValue('mocked'),
}));
```

### Mock Lifecycle — When to Use Each

```ts
afterEach(() => {
  vi.clearAllMocks();    // Keep impls, just clear call history
  // OR
  vi.resetAllMocks();    // Clear history + reset impls to undefined
  // OR
  vi.restoreAllMocks();  // Restore original impls (spyOn only)
});
```

## Key APIs (Summary)

| API | Purpose |
|-----|---------|
| `vi.fn(impl?)` | Create standalone mock |
| `vi.spyOn(obj, key)` | Spy on existing method |
| `vi.mock(path, factory?)` | Replace module (hoisted) |
| `vi.doMock(path, factory?)` | Replace module (not hoisted, dynamic imports only) |
| `vi.hoisted(() => {...})` | Reference outer vars inside `vi.mock` |
| `vi.mocked(obj)` | TypeScript narrow to mock type |
| `vi.importActual(path)` | Bypass mock, get real module |
| `vi.clearAllMocks()` | Clear call history only |
| `vi.resetAllMocks()` | Clear history + reset impls |
| `vi.restoreAllMocks()` | Restore original `spyOn` impls |
| `vi.stubGlobal(name, val)` | Stub a global variable |
| `vi.stubEnv(name, val)` | Stub `import.meta.env` |
| `vi.setSystemTime(date)` | Mock `new Date()` |
| `jest.useFakeTimers()` | Enable fake timers |
| `jest.runAllTimers()` | Exhaust all timers |
| `jest.runOnlyPendingTimers()` | Exhaust pending, stop before new ones |
| `jest.advanceTimersByTime(ms)` | Advance clock by ms |
| `jest.advanceTimersToNextFrame()` | Advance to next 16ms animation frame |
| `jest.clearAllTimers()` | Cancel all pending timers |

## Caveats

- **`vi.mock` is hoisted** — references to outer-scope variables fail silently. Use `vi.hoisted()` or switch to `vi.doMock()` (which only affects dynamic imports).
- **`vi.mock` doesn't work with `require()`** — ESM `import` only.
- **Default exports require `default` key** in mock factory: `return { default: vi.fn(), namedExport: vi.fn() }`.
- **`vi.doMock` won't affect already-imported modules** — only subsequent `await import(...)` calls.
- **Recursive timers + `runAllTimers()` = infinite loop error** (100k limit). Use `runOnlyPendingTimers()` instead.
- **`vi.restoreAllMocks()` ≠ `mock.mockRestore()`** — it only restores `spyOn` originals and does NOT clear history or reset impls.
- **`vi.spyOn` fails in Browser Mode** — use `vi.mock("./path", { spy: true })` as workaround.
- **Animation frames fire every 16ms** — `advanceTimersToNextFrame()` advances to the next 16ms boundary.

## Composition Hints
- Pair with `jest-vitest-test-organization` for lifecycle hooks (`beforeEach`/`afterEach` to clear mocks).
- Pair with `jest-vitest-mock-spy` for deeper mock assertion patterns (`toHaveBeenCalledWith`, `toHaveReturnedWith`, etc.).
- For timer-heavy React components, combine with `@testing-library/react`'s `act()` wrapper.
