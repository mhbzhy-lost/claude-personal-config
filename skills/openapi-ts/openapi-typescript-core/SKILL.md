---
name: openapi-typescript-core
description: Generate runtime-free TypeScript types from OpenAPI 3.0/3.1 schemas using Node.js — CLI and programmatic API with custom transforms
tech_stack: [openapi-ts]
language: [typescript]
capability: [api-design, ci-cd]
version: "openapi-typescript 7.x"
collected_at: 2025-01-01
---

# openapi-typescript

> Source: https://openapi-ts.dev/introduction, https://openapi-ts.dev/cli, https://openapi-ts.dev/node

## Purpose

Converts OpenAPI 3.0 & 3.1 schemas into **runtime-free TypeScript type definitions**. No Java, no codegen servers, no runtime dependency. The generated `.d.ts` files export `paths` and `components` namespaces that you import as types — nothing runs at runtime.

## When to Use

- You need pure TypeScript types from an OpenAPI spec (not a full HTTP client)
- Pairing with `openapi-fetch` for a lightweight typed fetch wrapper
- CI validation: `--check` exits non-zero when generated types are stale
- Programmatic type generation where you need custom AST transforms (`transform` / `postTransform` / `transformProperty`)
- Multiple API specs in one codebase (via `redocly.yaml` multi-schema config)
- FastAPI / remote schema URLs: point directly at `https://api.example.com/openapi.json`

**Not for:** OpenAPI 2.x (Swagger) — use openapi-typescript 5.x for that.

## Basic Usage

### Installation & Setup

```bash
npm i -D openapi-typescript typescript
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "module": "ESNext",          // or "NodeNext"
    "moduleResolution": "Bundler", // or "NodeNext"
    "noUncheckedIndexedAccess": true // recommended
  }
}
```

### CLI: Single Schema

```bash
npx openapi-typescript ./path/to/schema.yaml -o ./path/to/schema.d.ts
npx openapi-typescript https://petstore3.swagger.io/api/v3/openapi.yaml -o petstore.d.ts
```

### Consuming Generated Types

```ts
import type { paths, components } from "./my-openapi-3-schema";

type MyType = components["schemas"]["MyType"];
type EndpointParams = paths["/my/endpoint"]["parameters"];
type SuccessResponse = paths["/my/endpoint"]["get"]["responses"][200]["content"]["application/json"]["schema"];
```

### CLI: Multiple Schemas via redocly.yaml

```yaml
# redocly.yaml (project root)
apis:
  core@v2:
    root: ./openapi/openapi.yaml
    x-openapi-ts:
      output: ./openapi/openapi.ts
  external@v1:
    root: ./openapi/external.yaml
    x-openapi-ts:
      output: ./openapi/external.ts
```

Then just: `npx openapi-typescript` (no input/output args needed). Globbing was deprecated in v7 — use `redocly.yaml` instead.

### Auth for Private Schemas

```yaml
# redocly.yaml
resolve:
  http:
    headers:
      - matches: https://api.example.com/v2/**
        name: X-API-KEY
        envVariable: SECRET_KEY
      - matches: https://example.com/*/test.yaml
        name: Authorization
        envVariable: SECRET_AUTH
```

## Key APIs (Summary)

### High-Impact CLI Flags

| Flag | What it does |
|------|-------------|
| `-o` / `--output` | File destination (defaults to stdout) |
| `--check` | **CI mode**: exits non-zero if output is stale. Critical for CI/CD |
| `--enum` | Generate `enum` instead of string union |
| `--export-type` / `-t` | `type` alias instead of `interface` |
| `--immutable` | `readonly` on all properties and arrays |
| `--path-params-as-types` | Dynamic `paths[url]` lookup instead of exact template matching |
| `--array-length` | Tuple types from `minItems`/`maxItems` (e.g., `[string] \| [string, string]`) |
| `--additional-properties` | Allow extra props on all objects lacking `additionalProperties: false` |
| `--exclude-deprecated` | Strip deprecated fields |
| `--read-write-markers` | `$Read<T>` / `$Write<T>` wrappers for readOnly/writeOnly enforcement (designed for `openapi-fetch`) |
| `--make-paths-enum` | Generates `ApiPaths` enum of all path strings |
| `--alphabetize` | Sort types alphabetically |
| `--default-non-nullable` | (default: true) Treat objects with defaults as non-nullable |
| `--redocly` | Path to custom `redocly.yaml` |

### Node.js API

```ts
import openapiTS, { astToString } from "openapi-typescript";

const ast = await openapiTS(new URL("./my-schema.yaml", import.meta.url));
// also accepts: string, JSON object, URL, Readable stream, Buffer

const contents = astToString(ast);
fs.writeFileSync("./my-schema.ts", contents);
```

### Essential Node Options

| Option | Purpose |
|--------|---------|
| `transform(schemaObj, metadata)` | Override type output **before** TS conversion. Use for `format: "date-time"` → `Date`, `format: "binary"` → `Blob` |
| `postTransform(schemaObj, metadata)` | Same as `transform` but runs **after** TS conversion — works with TS AST nodes |
| `transformProperty(property, schemaObj, options)` | Per-property transforms. Use for JSDoc validation annotations (`@minLength`, `@pattern`, etc.). Runs after type conversion, before JSDoc |
| `redocly` | Provide Redocly config (`createConfig` or `loadConfig`) for multi-schema or custom validation |
| `silent` | Suppress warnings |
| `inject` | Prepend arbitrary TS code to output |
| `cwd` | Working directory for `$ref` resolution |

### Common Transform Patterns

**`format: "date-time"` → `Date`:**
```ts
transform(schemaObject, metadata) {
  if (schemaObject.format === "date-time") {
    return schemaObject.nullable
      ? ts.factory.createUnionTypeNode([DATE, NULL])
      : DATE;
  }
}
// Before: updated_at?: string;
// After:  updated_at: Date | null;
```

**`format: "binary"` → `Blob` with optional marker:**
```ts
transform(schemaObject, metadata) {
  if (schemaObject.format === "binary") {
    return {
      schema: schemaObject.nullable
        ? ts.factory.createUnionTypeNode([BLOB, NULL])
        : BLOB,
      questionToken: true,  // adds "?" to property
    };
  }
}
```

## Caveats

- **OpenAPI 2.x not supported in v7.** Downgrade to 5.x for Swagger specs.
- **Globbing removed in v7.** Multi-schema must use `redocly.yaml`.
- **`transform` / `transformProperty` need `typescript` as peer dep** for AST node factories (`ts.factory.*`).
- **`--check` is a CI gate**: always pair with a pre-commit hook or CI step to catch stale types.
- **`--read-write-markers` only enforced by `openapi-fetch`.** Other HTTP clients ignore `$Read`/`$Write` wrappers.
- **`transformProperty` order**: runs after type conversion but before JSDoc — can't interact with other transforms' output.
- **Remote schemas fail on network issues** — cache or pre-download for reproducible CI builds.
- **Invalid OpenAPI schemas fail generation** (Redocly validation runs first).

## Composition Hints

- **Pair with `openapi-fetch`** for a minimal typed fetch client (~2KB). The `--read-write-markers` flag is designed specifically for this pairing.
- **CI workflow**: `npx openapi-typescript --check schema.yaml -o schema.d.ts` in your pipeline. Fails the build if someone edited the schema but forgot to regenerate types.
- **FastAPI integration**: point `--input` at `http://localhost:8000/openapi.json` during development, commit the generated `.d.ts`.
- **Multiple API versions**: use `redocly.yaml` with separate `apis` entries (e.g., `core@v2`, `external@v1`), each with its own `x-openapi-ts.output`.
- **Custom type overrides**: use `transform` for format-based overrides (Date, Blob) and `transformProperty` for JSDoc annotation injection. Return `undefined` to keep the default behavior for unaffected schema objects.
- **Package as SDK**: generate types, add a thin fetch wrapper, publish as an npm package — consumers get full type safety without runtime bloat.
