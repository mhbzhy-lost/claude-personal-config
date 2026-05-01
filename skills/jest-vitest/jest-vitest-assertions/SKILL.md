---
name: jest-vitest-assertions
description: Jest/Vitest expect matchers — toBe, toEqual, toStrictEqual, toThrow, modifiers, asymmetric matchers, and Vitest-specific soft/poll/assert utilities.
tech_stack: [jest-vitest]
language: [typescript, javascript]
capability: [unit-testing]
version: "Jest 30.0 / Vitest"
collected_at: 2025-01-01
---

# Jest/Vitest Assertions & Matchers

> Source: https://jestjs.io/docs/expect, https://vitest.dev/api/expect.html

## Purpose

The `expect` function is the core assertion API in both Jest and Vitest. It validates values using "matcher" functions. Vitest provides both Chai-style assertions (e.g. `expect(value).to.equal(x)`) and Jest-compatible matchers (e.g. `expect(value).toBe(x)`). Since Vitest 4.1, spy/mock testing also supports Chai-style assertions alongside Jest-style.

## When to Use

- Any test that needs to verify a value, structure, or behavior
- Use `toBe` for primitives/referential identity; `toEqual` for deep structural equality; `toStrictEqual` when undefined keys and type identity matter
- Use `.resolves`/`.rejects` to assert on promise outcomes
- Use `expect.soft` (Vitest) when you want to see all failures before the test ends
- Use `expect.poll` (Vitest) for conditions that aren't immediately true (e.g., DOM appearing after async render)

## Basic Usage

```ts
// Primitive equality (Object.is)
expect(2 + 2).toBe(4)

// Deep structural equality
expect({ a: 1, b: [2, 3] }).toEqual({ a: 1, b: [2, 3] })

// Negation
expect('hello').not.toBe('world')

// Error throwing
expect(() => { throw new Error('boom') }).toThrow('boom')

// Promise resolution
await expect(Promise.resolve(42)).resolves.toBe(42)
await expect(Promise.reject('err')).rejects.toBe('err')

// Floating point (NOT toBe!)
expect(0.2 + 0.1).toBeCloseTo(0.3, 5)
```

## Key APIs (Summary)

### Equality & Identity
| Matcher | What it checks |
|---------|---------------|
| `.toBe(val)` | `Object.is` equality (primitives, referential identity) |
| `.toEqual(val)` | Deep recursive equality; compares Error `name`/`message`/`cause` |
| `.toStrictEqual(val)` | Like `toEqual` + checks undefined keys, array sparseness, class vs plain object |
| `.toBeCloseTo(num, digits?)` | Floating-point approx; `Math.abs(expected - received) < 10⁻ⁿ/2` |

### Truthiness & Nullity
| Matcher | Passes when value is... |
|---------|------------------------|
| `.toBeTruthy()` | Truthy (not `false`, `null`, `undefined`, `NaN`, `0`, `-0`, `0n`, `""`, `document.all`) |
| `.toBeFalsy()` | Falsy |
| `.toBeNull()` | `null` |
| `.toBeDefined()` | Not `undefined` |
| `.toBeUndefined()` | `undefined` |
| `.toBeNaN()` | `NaN` |
| `.toBeNullable()` | `null` or `undefined` (Vitest only) |

### Numeric Comparison
`.toBeGreaterThan(n)`, `.toBeGreaterThanOrEqual(n)`, `.toBeLessThan(n)`, `.toBeLessThanOrEqual(n)` — accept `number | bigint`.

### Content & Structure
| Matcher | Checks |
|---------|--------|
| `.toContain(item)` | Item in array (`===`) or substring |
| `.toContainEqual(item)` | Item in array using deep equality |
| `.toHaveLength(n)` | `.length === n` |
| `.toHaveProperty(path, val?)` | Property at keyPath (dot notation or array); optional deep-equal value |
| `.toMatch(regex\|str)` | String matches regex or contains substring |
| `.toMatchObject(obj)` | Subset match — actual must contain expected properties |

### Type Checking
| Matcher | Notes |
|---------|-------|
| `.toBeInstanceOf(Class)` | Uses `instanceof` |
| `.toBeTypeOf('string'\|'number'\|...)` | Vitest only; uses `typeof` (caveat: `null` → `'object'`) |
| `.toBeOneOf([...])` | Vitest only; value matches any in array/set |

### Modifiers
- **`.not`** — negate any matcher
- **`.resolves`** — unwrap fulfilled promise, then chain matcher. Must `return` or `await`
- **`.rejects`** — unwrap rejected promise, then chain matcher. Must `return` or `await`

### Asymmetric Matchers (both Jest and Vitest)
`expect.any(Constructor)`, `expect.anything()`, `expect.arrayContaining(arr)`, `expect.objectContaining(obj)`, `expect.stringContaining(str)`, `expect.stringMatching(regex)`, `expect.closeTo(num, digits?)`.

### Vitest-Only Utilities
- **`expect.soft(actual).toBe(...)`** — failed assertion marks test as failed but continues execution; all errors reported at end. Only works inside `test()`.
- **`expect.poll(() => value, { interval, timeout })`** — retries assertion until pass or timeout. Must `await`. Incompatible with snapshots, `.resolves`/`.rejects`, `toThrow`.
- **`expect.assert(condition)`** — Chai `assert` API, useful for TypeScript type narrowing.

## Caveats

- **Floating point**: Never use `.toBe` for floats. Use `.toBeCloseTo`.
- **`.resolves`/`.rejects` are async**: You must `return` or `await` the assertion, otherwise the test completes before it runs.
- **`expect.poll` restrictions**: No snapshot matchers, no `.resolves`/`.rejects`, no `toThrow`. Always `await` it.
- **`expect.soft` restrictions**: Vitest only; only inside `test()` function.
- **`Error.cause` in `toEqual`**: Asymmetric — `new Error('hi')` matches `new Error('hi', {cause:'x'})`, but not the reverse.
- **`toBeTypeOf` quirks**: Uses native `typeof` — `null` is `'object'`, arrays are `'object'`.
- **Dotted keys in `toHaveProperty`**: Wrap in array to prevent deep-reference parsing: `expect(obj).toHaveProperty(['ceiling.height'], 'tall')`.
- **`toBe` vs `toEqual`**: `toBe` is `Object.is` (reference check for objects). `toEqual` is structural. If a class instance should NOT equal a plain object, use `toStrictEqual`.

## Composition Hints

- Pair with **jest-vitest-mock-spy** for asserting on mock function calls (`.toHaveBeenCalled` etc.)
- Pair with **jest-vitest-async** for `.resolves`/`.rejects` combined with fake timers and `waitFor`
- Pair with **jest-vitest-snapshot** for snapshot matchers (`.toMatchSnapshot`, `.toMatchInlineSnapshot`)
- Use `expect.extend()` to add custom matchers shared across test suites
