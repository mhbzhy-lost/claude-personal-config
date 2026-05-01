---
name: jest-vitest-test-organization
description: Structuring test files with describe, lifecycle hooks, parameterized tests, fixtures, and test modifiers in Jest and Vitest
tech_stack: [jest-vitest]
language: [typescript, javascript]
capability: [unit-testing]
version: "Jest 30.0 / Vitest unversioned"
collected_at: 2025-01-01
---

# Test Organization in Jest/Vitest

> Source: https://jestjs.io/docs/api, https://vitest.dev/api/test, https://vitest.dev/guide/learn/writing-tests

## Purpose
Structure test files with `describe` blocks, lifecycle hooks (`beforeAll`/`afterAll`/`beforeEach`/`afterEach`), parameterized tests (`test.each`/`test.for`), test modifiers (skip, only, todo, fails), concurrent execution, and custom fixtures via `test.extend`.

## When to Use
- Grouping related tests into logical suites
- Setting up shared state that multiple tests need
- Running the same test logic against many input/output pairs
- Temporarily focusing or skipping tests during development
- Speeding up independent tests with concurrency
- Injecting typed fixtures (DB connections, servers, etc.) into tests

## Basic Usage

### Core Building Blocks

```ts
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

describe('Math.sqrt', () => {
  beforeAll(() => { /* setup once before all tests in this block */ });
  afterAll(() => { /* teardown once after all tests */ });
  beforeEach(() => { /* reset before each test */ });
  afterEach(() => { /* cleanup after each test */ });

  test('returns square root of perfect squares', () => {
    expect(Math.sqrt(4)).toBe(2);
  });

  test('returns NaN for negative numbers', () => {
    expect(Math.sqrt(-1)).toBeNaN();
  });
});
```

Hooks run at their describe scope. Nested `describe` blocks are supported but keep nesting shallow (1-2 levels max).

### Lifecycle Hook Execution Order

For this structure:
```
describe (outer)
  beforeAll
  beforeEach
    describe (inner)
      beforeAll
      beforeEach
        test A
      afterEach
    afterAll
  afterEach
afterAll
```

The order for `test A`: outer beforeAll → outer beforeEach → inner beforeAll → inner beforeEach → test A → inner afterEach → inner afterAll → outer afterEach → outer afterAll. All hooks can be `async` or return a promise.

### Test Modifiers

```ts
// Skip
test.skip('not ready', () => { /* never runs */ });
describe.skip('whole suite skipped', () => { /* ... */ });
test.skipIf(process.env.CI)('local only', () => { /* ... */ });
test.runIf(isDev)('dev only', () => { /* ... */ });

// Focus — ONLY this runs in the file. CI will error by default.
test.only('debug this', () => { /* ... */ });
describe.only('only this suite', () => { /* ... */ });

// Placeholder
test.todo('write this later');

// Expected failure — test passes if it fails
test.fails('known bug #1234', () => {
  expect(brokenFn()).toBe(42);
});

// Dynamic skip from inside the test
test('conditional', (context) => {
  if (!featureFlag) context.skip();
  // ...
});
```

### Parameterized Tests — `test.each` vs `test.for`

**`test.each`** (Jest-compatible) — **spreads** array arguments:

```ts
test.each([
  [1, 1, 2],
  [1, 2, 3],
])('add(%i, %i) -> %i', (a, b, expected) => {
  expect(a + b).toBe(expected);
});
```

**`test.for`** (Vitest preferred) — does **NOT** spread, provides **TestContext** as second argument:

```ts
test.for([
  [1, 1, 2],
  [1, 2, 3],
])('add(%i, %i) -> %i', ([a, b, expected]) => {
  expect(a + b).toBe(expected);
});

// With TestContext (required for concurrent snapshots):
test.concurrent.for([[1, 1], [1, 2]])('add(%i, %i)', ([a, b], { expect }) => {
  expect(a + b).toMatchSnapshot();
});
```

Tagged template literal syntax (both `each` and `for`):
```ts
test.each`
  a    | b    | expected
  ${1} | ${1} | ${2}
  ${1} | ${2} | ${3}
`('$a + $b = $expected', ({ a, b, expected }) => {
  expect(a + b).toBe(expected);
});
```

Both also work with `describe.each` / `describe.for` to create parameterized suites.

### Format Specifiers

`%s` string, `%d` number, `%i` integer, `%f` float, `%j` JSON, `%o` object, `%p` pretty-format, `%#` 0-based index, `%$` 1-based index. Object properties: `$propertyName`.

### Concurrent vs Sequential

Tests within a file run **sequentially** by default. Use `test.concurrent` for parallel execution:

```ts
test.concurrent('parallel 1', async () => { /* ... */ });
test.concurrent('parallel 2', async () => { /* ... */ });

// Or make an entire suite concurrent:
describe.concurrent('parallel suite', () => {
  test('runs in parallel', async () => { /* ... */ });
  test.sequential('but this runs alone', async () => { /* ... */ });
});
```

> **Critical for concurrent snapshots**: use context-scoped `expect`:
> ```ts
> test.concurrent('snapshot', async ({ expect }) => {
>   expect(data).toMatchSnapshot();
> });
> ```

### Custom Fixtures with `test.extend`

```ts
import { test as base } from 'vitest';

const test = base
  .extend('db', async () => {
    const db = await createTestDb();
    return db;
  })
  .extend('user', async ({ db }) => {
    return db.insertUser({ name: 'test' });
  });

test('has user', ({ db, user }) => {
  expect(user.name).toBe('test');
});
```

Override fixtures per-suite (4.1.0+):
```ts
describe('admin', () => {
  test.override({ user: { name: 'admin', role: 'admin' } });
  test('is admin', ({ user }) => {
    expect(user.role).toBe('admin');
  });
});
```

### Test File Conventions

Files matching `**/*.test.{ts,js,tsx,jsx}` or `**/*.spec.{ts,js,tsx,jsx}` are auto-discovered. Co-locate with source or use `__tests__/` directories. Vitest runs all test files in parallel (separate processes), but tests within a file run sequentially.

## Key APIs (Summary)

| API | Purpose |
|-----|---------|
| `test(name, fn)` / `it(name, fn)` | Define a test |
| `describe(name, fn)` | Group tests into a suite |
| `beforeAll` / `afterAll` | Run once per describe block |
| `beforeEach` / `afterEach` | Run per test in describe block |
| `test.skip` / `describe.skip` | Skip test or suite |
| `test.skipIf(cond)` / `test.runIf(cond)` | Conditional skip/run |
| `test.only` / `describe.only` | Run only this (CI-fails by default) |
| `test.todo` | Placeholder test |
| `test.fails` | Test expected to fail |
| `test.concurrent` | Run test in parallel |
| `test.sequential` | Force sequential in concurrent suite |
| `test.each(table)(name, fn)` | Parameterized (spreads arrays, Jest compat) |
| `test.for(cases)(name, fn)` | Parameterized (no spread, gives TestContext) |
| `describe.each` / `describe.for` | Parameterized suite |
| `test.extend(name, value)` | Custom typed fixtures |
| `test.override(values)` | Override fixtures per suite (4.1.0+) |

## Caveats

- **`test.for` does NOT spread arrays** unlike `test.each`. Use `([a, b]) =>` not `(a, b) =>`.
- **`test.only`/`describe.only` cause CI failures** — Vitest detects CI and throws. Configure `allowOnly` to override.
- **Skipped describe blocks still run hooks** — `beforeAll`/`beforeEach` inside a skipped describe still execute. Move expensive setup into the hooks themselves.
- **Concurrent tests need context-scoped `expect`** for snapshots — global `expect` can't disambiguate which test a snapshot belongs to.
- **Positional timeout arg conflicts with options object** — use `test('name', { timeout: 10000 }, fn)` not `test('name', { skip: true }, fn, 10000)`.
- **Vitest: explicit imports by default** — `test`, `expect`, `describe` must be imported from `vitest` unless `globals: true` is set in config.
- **Jest: globals by default** — no imports needed, but `@jest/globals` available for explicit imports.
