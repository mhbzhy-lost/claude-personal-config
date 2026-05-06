---
name: orval-msw-zod
description: Generate MSW mock handlers with Faker.js and Zod validation schemas from OpenAPI specs using Orval.
tech_stack: [react]
language: typescript
capability: [integration-testing, form-validation]
version: "orval unversioned"
collected_at: 2025-01-01
---

# Orval — MSW Mocks & Zod Validation

> Source: https://orval.dev/docs/guides/msw.md, https://orval.dev/docs/guides/zod.md, https://orval.dev/docs/guides/client-with-zod.md

## Purpose
Orval generates **MSW (Mock Service Worker) request handlers** with Faker.js-powered mock data and **Zod validation schemas** from an OpenAPI spec. MSW handlers can be used with `setupServer` (Node/Vitest/Jest) or `setupWorker` (browser) for development and testing. Zod schemas provide runtime validation with `.parse()`/`.safeParse()` and `z.infer<>` type inference.

## When to Use
- **API mocking** during development and testing — set `mock: true` to generate per-operation MSW handlers with Faker.js data, delay simulation, and aggregated handler arrays.
- **Runtime validation** of request/response bodies — set `client: 'zod'` to generate Zod schemas for every OpenAPI model.
- **Combined workflow** — define two projects in `orval.config` (one for HTTP client + mocks, one for Zod) to get typed hooks, mock handlers, and validation schemas from a single spec.

## Basic Usage

### MSW mock generation

```ts
import { defineConfig } from 'orval';

export default defineConfig({
  petstore: {
    output: {
      target: './src/api/petstore.ts',
      schemas: './src/api/model',
      mock: true,          // ← enables MSW generation
    },
    input: { target: './petstore.yaml' },
  },
});
```

### Zod schema generation

```ts
export default defineConfig({
  petstore: {
    output: {
      client: 'zod',
      target: './src/api/schemas',
    },
    input: { target: './petstore.yaml' },
  },
});
```

### Combined: HTTP client + mocks + Zod

```ts
export default defineConfig({
  petstore: {
    output: {
      client: 'swr',
      target: 'src/api/endpoints',
      schemas: 'src/api/models',
      mock: true,
    },
    input: { target: './petstore.yaml' },
  },
  petstoreZod: {
    output: {
      client: 'zod',
      target: 'src/api/endpoints',
      fileExtension: '.zod.ts',   // ← avoids filename collisions
    },
    input: { target: './petstore.yaml' },
  },
});
```

## Key APIs (Summary)

### MSW — three generated artifacts per spec

| Artifact | Signature | Purpose |
|---|---|---|
| **Mock data generator** | `getXResponseMock(override?: Partial<T>): T` | Returns Faker.js fake data; accepts partial overrides |
| **Request handler** | `getXMockHandler(override?, options?): HttpHandler` | MSW `http.get/post/…` handler factory with `delay()`, `HttpResponse`, and dynamic/static override support |
| **Aggregated handlers** | `getPetsMock(): HttpHandler[]` | Spread into `setupServer(...getPetsMock())` |

### MSW handler features

| Feature | How |
|---|---|
| **Static override** | `getShowPetByIdMockHandler({ id: 1, name: 'Buddy' })` |
| **Dynamic override** | `getShowPetByIdMockHandler(async (info) => ({ id: Number(info.params.petId) }))` |
| **Error simulation** | `getShowPetByIdMockHandler(() => { throw new HttpResponse(null, { status: 500 }); })` |
| **Per-test override** | `server.use(getXMockHandler(...))` (MSW best practice) |
| **Handler options** | Second arg accepts `RequestHandlerOptions` e.g. `{ once: true }` |
| **Delay** | `await delay(1000)` inside every handler (uses MSW v2 standalone `delay`) |

### MSW test setup (Vitest/Jest)

```ts
import { getPetsMock } from './api/petstore.msw';
import { setupServer } from 'msw/node';

const server = setupServer(...getPetsMock());
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### MSW config options

| Option | Effect |
|---|---|
| `mock.type: 'msw'` | Explicit MSW mode |
| `mock.baseUrl` | Replace wildcard `*` prefix with absolute URL (e.g. `https://api.example.com`) |
| `mock.preferredContentType` | Force a specific `HttpResponse` helper when multiple content types are in the spec |
| `mock.delay` | Override the default delay per operation or globally |

### Content-type → HttpResponse mapping

| Content type | Response helper |
|---|---|
| `application/json` | `HttpResponse.json()` |
| `application/xml`, `*+xml` | `HttpResponse.xml()` |
| `text/html` | `HttpResponse.html()` |
| `text/plain`, `text/*` | `HttpResponse.text()` |
| `application/octet-stream`, `image/*` | `HttpResponse.arrayBuffer()` |
| No body (204, etc.) | `new HttpResponse(null, { status })` |

### Zod API

```ts
// .parse() — throws on failure
const parsed = createPetsBody.parse(rawData);

// .safeParse() — returns result object
const result = createPetsBody.safeParse(unknownData);

// z.infer — extract the TypeScript type
type Pet = z.infer<typeof createPetsBody>;
```

### Combined client + Zod usage pattern

```tsx
import { useCreatePets } from './api/endpoints/pets/pets';
import { createPetsBodyItem } from './api/endpoints/pets/pets.zod';

const { trigger } = useCreatePets();

const createPet = async () => {
  try {
    const validated = createPetsBodyItem.parse({ name: 'Buddy', tag: 'dog' });
    await trigger([validated]);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('Validation failed:', error.errors);
    }
  }
};
```

## Caveats
- **File collision**: When generating both HTTP client and Zod from the same spec, always set `fileExtension: '.zod.ts'` in the Zod project.
- **Wildcard vs absolute URLs**: Default handlers use `*/pets/:petId` (matches any host). Set `mock.baseUrl` for absolute matching, which MSW recommends for precise interception.
- **Multiple content types**: Orval picks the first matching content type from the spec. Override with `mock.preferredContentType` if you need a specific one (e.g. JSON over XML).
- **MSW v2+ required**: Generated handlers use the standalone `delay()` import and `HttpResponse` class from MSW v2, not the legacy `ctx.delay`/`res()` pattern.
- **Path params**: OpenAPI `{param}` is converted to MSW `:param`. Query parameters are excluded from path predicates per MSW guidance.
- **`server.use()` pattern**: Use `server.use()` directly for per-test overrides — do not combine with `server.resetHandlers()`.

## Composition Hints
- Pair with **orval-core** for base Orval config (`defineConfig`, CLI, `--watch`).
- Pair with **orval-data-fetching** to add React Query or SWR hooks alongside mocks and Zod schemas in a single multi-project config.
- For **dynamic imports** of all mocks, enable `indexMockFiles` and use `Object.entries(mocks).flatMap(([, getMock]) => getMock())`.
