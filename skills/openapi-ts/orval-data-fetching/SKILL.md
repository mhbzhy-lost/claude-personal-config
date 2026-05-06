---
name: orval-data-fetching
description: Generate fully typed React Query (TanStack Query) and SWR data-fetching hooks from OpenAPI specs using Orval.
tech_stack: [react]
language: typescript
capability: [data-fetching, http-client]
version: "orval unversioned"
collected_at: 2025-01-01
---

# Orval — Data Fetching (React Query / SWR)

> Source: https://orval.dev/docs/guides/react-query.md, https://orval.dev/docs/guides/swr.md, https://orval.dev/docs/guides/fetch-client.md

## Purpose
Orval auto-generates fully typed data-fetching hooks for **TanStack Query (React Query)** and **SWR** directly from an OpenAPI specification. One custom hook is emitted per API operation, along with query-key helpers and optional cache-mutation utilities.

## When to Use
- Your project already uses **TanStack Query** (`@tanstack/react-query`) — set `client: 'react-query'` to get `useQuery`, `useMutation`, and optionally `useInfiniteQuery` hooks, plus `getQueryKey` / `useSetQueryData` / `useGetQueryData` helpers.
- Your project uses **SWR** — set `client: 'swr'` to get `useSwr` hooks with `swrKey` helpers and conditional-fetching (`enabled`) support.
- You want **fetch-based** HTTP transport instead of axios — apply `override.fetch` or a custom mutator.

## Basic Usage

### React Query

```ts
import { defineConfig } from 'orval';

export default defineConfig({
  petstore: {
    output: {
      mode: 'tags-split',
      target: 'src/api/petstore.ts',
      schemas: 'src/api/model',
      client: 'react-query',
      mock: true,
    },
    input: { target: './petstore.yaml' },
  },
});
```

### SWR

```ts
export default defineConfig({
  petstore: {
    output: {
      client: 'swr',
      target: 'src/api/petstore.ts',
      schemas: 'src/api/model',
      mock: true,
    },
    input: { target: './petstore.yaml' },
  },
});
```

Generated hooks expose the standard library API (`data`, `error`, `isLoading`, etc.) and accept typed `axios`/`fetch` options alongside query-library options.

## Key APIs (Summary)

| Config path | Effect |
|---|---|
| `output.client: 'react-query'` | Generate TanStack Query hooks |
| `output.client: 'swr'` | Generate SWR hooks |
| `override.query.useInfinite: true` | Add `useInfiniteQuery` alongside `useQuery` |
| `override.query.useInfiniteQueryParam: 'cursor'` | Pagination param name for infinite queries |
| `override.query.options.staleTime` | Global staleTime for all queries |
| `override.operations.<op>.query` | Per-operation query overrides (e.g. infinite mode for a single endpoint) |
| `override.query.useSetQueryData: true` | Generate `useSetXQueryData()` cache-write helpers |
| `override.query.useGetQueryData: true` | Generate `useGetXQueryData()` cache-read helpers |
| `override.fetch.includeHttpResponseReturnType: false` | Strip `{data, status}` wrapper; return the model directly |
| `override.mutator` | Swap the HTTP transport (path + name → custom fetch/axios wrapper) |

### SWR conditional fetching

```tsx
const { data } = useShowPetById(petId, {
  swr: { enabled: !!petId },
});
```

### Fetch client: simplified return type

```ts
override: {
  fetch: { includeHttpResponseReturnType: false },
}
```

This changes `Promise<{data: Pet; status: number}>` → `Promise<Pet>`.

## Caveats
- **Fetch client wraps responses** in `{data, status}` by default — you must destructure `data.data`. Flip `includeHttpResponseReturnType: false` to remove the wrapper, but then HTTP error info is lost from the return type.
- **Infinite query param** (`useInfiniteQueryParam`) must match the actual pagination parameter name in the OpenAPI spec (`cursor`, `page`, `nextId`, etc.).
- **SWR hooks are auto-enabled** when required params (e.g. `petId`) are truthy. Use `swr.enabled` to override for conditional fetching.
- **Custom mutators** require both `path` and `name` pointing to a valid fetch/axios wrapper implementation.

## Composition Hints
- Pair with **orval-core** for the base Orval configuration (`defineConfig`, CLI flags, `--watch` for incremental generation).
- Combine with **orval-msw-zod** to add MSW mock handlers and Zod runtime validation alongside the generated hooks.
- Use `fileExtension: '.zod.ts'` in a separate Zod project when generating both clients and schemas from the same spec to avoid filename collisions.
