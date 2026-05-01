---
name: jest-vitest-coverage-ci
description: Code coverage configuration and CI enforcement with Jest and Vitest — providers, thresholds, ignore patterns, and reporter setup
tech_stack: [jest-vitest]
language: [typescript]
capability: [unit-testing, ci-cd]
version: "Jest 30.0 / Vitest (v8 AST remapping v3.2.0+)"
collected_at: 2025-07-17
---

# Coverage & CI (Jest + Vitest)

> Source: https://jestjs.io/docs/configuration, https://vitest.dev/guide/coverage.html

## Purpose

Code coverage measures which lines, branches, functions, and statements are exercised by tests. Both Jest and Vitest can collect coverage, generate reports, and enforce minimum thresholds — typically used as a CI quality gate.

## When to Use

- Enforcing minimum coverage thresholds in CI (PR gating)
- Identifying untested code paths during development
- Generating browseable coverage reports (HTML, lcov for IDE integration)
- Excluding known-safe files from coverage (vendors, generated code, type declarations)

## Basic Usage

### Enabling coverage

```bash
jest --coverage
vitest run --coverage
```

Or in config:

```ts
// Jest (jest.config.ts)
const config = { collectCoverage: true };

// Vitest (vitest.config.ts)
export default defineConfig({
  test: { coverage: { enabled: true } },
});
```

### Choosing a coverage provider

```ts
// Jest: 'babel' (default) or 'v8'
coverageProvider: 'v8'

// Vitest: 'v8' (default) or 'istanbul'
coverage: { provider: 'v8' }
```

Install Vitest providers:
```bash
npm i -D @vitest/coverage-v8       # v8 (recommended)
npm i -D @vitest/coverage-istanbul # istanbul
```

### Provider comparison

| | V8 (both) | Istanbul/Babel (both) |
|---|---|---|
| Pre-instrumentation | No | Yes |
| Runtime | V8 only (Node, Deno, Chromium) | Any JS runtime |
| Speed | Faster | Slower (instrumentation overhead) |
| Memory | Lower | Higher |
| File-specific collection | No (instruments all modules) | Yes |
| Ignore comments (Vitest) | `/* v8 ignore next */` | `/* istanbul ignore next */` |
| Ignore comments (Jest) | `/* c8 ignore next */` | `/* istanbul ignore next */` |

Vitest's v8 provider has used AST-based remapping since v3.2.0, producing Istanbul-equivalent accuracy at V8 speed.

## Key APIs (Summary)

### Coverage thresholds (CI gate)

```ts
// Jest
coverageThreshold: {
  global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  './src/components/': { branches: 40, statements: 40 },  // per-path
}

// Vitest
coverage: {
  thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
}
```

- **Positive numbers**: minimum % required. Test run fails if below threshold.
- **Negative numbers** (Jest only): max uncovered entities allowed. `statements: -10` = at most 10 uncovered statements.
- Per-path thresholds are subtracted from `global` and checked independently.
- **Vitest uses `thresholds`**, not `coverageThreshold` like Jest.

### File inclusion/exclusion

```ts
// Jest
collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
coveragePathIgnorePatterns: ['/node_modules/', '<rootDir>/build/'],

// Vitest
coverage: {
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['**/*.test.ts', '**/vendor/**'],
}
```

**Critical Jest gotcha**: glob patterns in `collectCoverageFrom` are applied in order. Negations must come *after* the patterns they narrow:
```ts
// WRONG — __tests__ NOT excluded
["!**/__tests__/**", "**/*.js"]
// RIGHT
["**/*.js", "!**/__tests__/**"]
```

### Reporters

```ts
// Jest — default: ["clover","json","lcov","text"]
coverageReporters: ['text', 'lcov', 'html', ['text', { skipFull: true }]],

// Vitest
coverage: { reporter: ['text', 'html', 'lcov'] }
```

Setting this *overwrites* defaults — include `"text"` or `"text-summary"` if you want console output.

### Ignoring code from coverage

```ts
// Vitest v8 (add -- @preserve for TypeScript/esbuild)
/* v8 ignore next -- @preserve */
console.log('not covered');

/* v8 ignore if -- @preserve */
if (DEBUG) { /* ... */ }

/* v8 ignore start -- @preserve */
export function debugOnly() { /* ... */ }
/* v8 ignore stop -- @preserve */

/* v8 ignore file -- @preserve */  // entire file

// Vitest istanbul / Jest babel
/* istanbul ignore next */
/* istanbul ignore if */
/* istanbul ignore else */

// Jest v8
/* c8 ignore next */
```

Without `-- @preserve`, esbuild strips comments and ignore hints are lost.

### Typical CI-ready config

```ts
// Vitest
export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts'],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});

// Jest
const config = {
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/*.test.{ts,tsx}'],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
```

## Caveats

1. **Glob ordering in `collectCoverageFrom` (Jest)**: negation patterns must follow inclusive ones. Wrong ordering silently includes files you meant to exclude.

2. **"Unknown%" coverage output**: means globs don't match any files. Verify `collectCoverageFrom`/`include` patterns against your actual file tree.

3. **esbuild strips ignore comments**: always use `-- @preserve` suffix with Vitest + TypeScript: `/* v8 ignore next -- @preserve */`.

4. **Vitest uses `thresholds` not `coverageThreshold`**: key names differ between Jest and Vitest config.

5. **Coverage slows tests**: run coverage as a separate CI step. Avoid enabling it permanently in dev watch mode.

6. **Reporter list overwrites defaults**: if you set `reporter: ['html']`, you lose the `text` console summary. Include `'text'` or `'text-summary'` explicitly.

7. **Force-including test files**: use `forceCoverageMatch: ['**/*.t.js']` (Jest) to collect coverage from files normally treated as tests.

8. **CI auto-detection**: Vitest uses `process.env.CI`. In agent environments, it auto-adds `text-summary` reporter and skips 100%-covered files in output.

## Composition Hints

- Pair with **mock/spy** skills — proper mocking ensures coverage numbers reflect the code under test, not dependencies.
- Combine with **snapshot** skills — snapshot tests contribute to coverage metrics.
- For monorepos, use per-package thresholds with path-specific `coverageThreshold` entries (Jest) or separate Vitest workspace projects.
- Use `lcov` reporter with IDE plugins and CI dashboards (Codecov, Coveralls); `html` reporter for local browsing.
- When coverage is unexpectedly low, check that `include`/`collectCoverageFrom` covers all source directories.
