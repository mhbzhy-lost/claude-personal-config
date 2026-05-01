---
name: jest-vitest-snapshot
description: Snapshot testing with Jest and Vitest — external, inline, file, visual and ARIA snapshots, property matchers, and CI behavior
tech_stack: [jest-vitest]
language: [typescript]
capability: [unit-testing, e2e-testing]
version: "Jest 30.0 / Vitest (ARIA snapshots 4.1.4+)"
collected_at: 2025-07-17
---

# Snapshot Testing (Jest + Vitest)

> Source: https://jestjs.io/docs/snapshot-testing, https://vitest.dev/guide/snapshot.html

## Purpose

Snapshot tests capture serialized output and compare it against a committed reference file. When the output changes, the test fails — either a bug was introduced, or the snapshot needs intentional updating. Both Jest and Vitest provide this mechanism; Vitest extends it with file snapshots, visual screenshots, and ARIA accessibility snapshots.

## When to Use

- Verifying UI component output (React, Vue, etc.) doesn't change unexpectedly
- Regression-testing API responses, logs, error messages, or any serializable value
- Visual regression testing (Vitest browser mode `toMatchScreenshot`)
- Accessibility regression testing (Vitest ARIA snapshots)
- Complementing (not replacing) unit tests

## Basic Usage

### External snapshots (`.snap` files)

```ts
// Jest
import renderer from 'react-test-renderer';

it('renders correctly', () => {
  const tree = renderer.create(<Link page="http://www.facebook.com">Facebook</Link>).toJSON();
  expect(tree).toMatchSnapshot();
});

// Vitest
import { expect, it } from 'vitest';

it('toUpperCase', () => {
  expect(toUpperCase('foobar')).toMatchSnapshot();
});
```

First run creates a `__snapshots__/` file. Subsequent runs diff against it.

### Inline snapshots (embedded in source)

```ts
expect(result).toMatchInlineSnapshot();
// After first run, Jest/Vitest rewrites the line:
expect(result).toMatchInlineSnapshot('"FOOBAR"');
```

### Vitest-only: file snapshots

```ts
await expect(result).toMatchFileSnapshot('./test/basic.output.html');
```

Stores expected output in arbitrary files — useful for HTML, SVG, or any text format where `.snap` escaping is awkward.

### Vitest-only: visual screenshots (browser mode)

```ts
import { page } from 'vitest/browser';

test('button looks correct', async () => {
  await expect(page.getByRole('button')).toMatchScreenshot('primary-button');
});
```

## Key APIs (Summary)

| Matcher | Jest | Vitest |
|---------|------|--------|
| `toMatchSnapshot(hint?)` | ✅ | ✅ |
| `toMatchSnapshot(propertyMatchers?, hint?)` | ✅ | ✅ |
| `toMatchInlineSnapshot()` | ✅ | ✅ |
| `toMatchInlineSnapshot(propertyMatchers?, inline?)` | ✅ | ✅ |
| `toThrowErrorMatchingSnapshot(hint?)` | ✅ | ✅ |
| `toMatchFileSnapshot(filePath)` | — | ✅ |
| `toMatchScreenshot(name?)` | — | ✅ (browser) |
| `toMatchAriaSnapshot()` | — | ✅ (experimental) |
| `toMatchAriaInlineSnapshot()` | — | ✅ (experimental) |

### Property matchers — handle non-deterministic data

```ts
expect(user).toMatchSnapshot({
  createdAt: expect.any(Date),
  id: expect.any(Number),
});
// Snapshot stores: { "createdAt": Any<Date>, "id": Any<Number>, "name": "LeBron James" }
```

### Updating snapshots

```bash
jest --updateSnapshot   # or -u
vitest -u               # or --update
```

In watch mode: press `u` to step through failures interactively. Use `--testNamePattern` to limit which snapshots regenerate.

### CI behavior

- **Jest (≥20)**: snapshots are NOT auto-written in CI. Missing/obsolete snapshots fail the run. Pass `--updateSnapshot` explicitly if needed.
- **Vitest**: does not write snapshots when `process.env.CI` is truthy. Mismatched, missing, *and obsolete* snapshots all fail.

### Custom serializers (Vitest)

```ts
expect.addSnapshotSerializer({
  serialize(val, config, indentation, depth, refs, printer) {
    return `Pretty foo: ${printer(val.foo, config, indentation, depth, refs)}`;
  },
  test(val) {
    return val && Object.prototype.hasOwnProperty.call(val, 'foo');
  },
});
```

Also configurable via `snapshotSerializers` in `vitest.config.ts`.

## Caveats

### Jest → Vitest migration differences

1. **Snapshot file header**: Vitest uses `// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html` — different from Jest's header. Expect commit diffs on migration.
2. **`printBasicPrototype` defaults to `false`** in Vitest: output is cleaner (`[{…}]` vs `Array [Object {…}]`). Restore Jest behavior via `snapshotFormat.printBasicPrototype: true`.
3. **Custom message separator**: Vitest uses `>` (chevron), Jest uses `:` (colon) — `exports[\`name > hint 1\`]` vs `exports[\`name: hint 1\`]`.
4. **`toThrowErrorMatchingSnapshot`**: Jest snapshots `Error.message` only; Vitest snapshots the full `Error` instance.

### Best practices

1. **Commit snapshots and review them** — treat them as code. Use `eslint-plugin-jest` with `no-large-snapshots`.
2. **Tests must be deterministic** — mock `Date.now()`, random generators, etc. Use property matchers for unavoidable variance.
3. **Use descriptive names** — `should render Alan Turing` not `should handle some test case`.
4. **Never `-u` blindly** — investigate failures before regenerating snapshots.
5. **Async concurrent tests** — use `expect` from the local Test Context to ensure correct snapshot-to-test mapping.
6. **Branch conflicts** — resolve manually or re-run to regenerate; snapshot files must represent current state.

## Composition Hints

- Combine with **mock/spy** skills to control non-deterministic dependencies before snapshotting.
- Use **property matchers** (`expect.any()`) for fields like timestamps, IDs, and random values rather than mocking everything.
- For CI pipelines, pair with **coverage-ci** skills — snapshot tests contribute to coverage metrics.
- Inline snapshots work best for small, focused outputs; external `.snap` files scale better for large component trees.
- Vitest file snapshots (`.toMatchFileSnapshot`) are ideal for testing generated HTML, SVG, or config output where syntax highlighting matters.
