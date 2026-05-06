---
name: tanstack-query-usequery
description: Fetch, cache, and synchronize server state in React using the useQuery hook from TanStack Query v5.
tech_stack: [react]
language: typescript
capability: [data-fetching]
version: "TanStack Query v5"
collected_at: 2026-03-18
---

# useQuery (TanStack Query v5)

> Source: https://tanstack.com/query/latest/docs/framework/react/guides/queries, https://tanstack.com/query/latest/docs/framework/react/guides/query-keys, https://tanstack.com/query/latest/docs/framework/react/guides/query-functions, https://tanstack.com/query/latest/docs/framework/react/reference/useQuery

## Purpose

`useQuery` is the core hook for fetching and caching asynchronous data in React. It ties a **unique query key** to a **Promise-returning function**, then manages loading, error, success states, background refetching, caching, and garbage collection automatically.

## When to Use

- Fetching data from REST, GraphQL, or any Promise-based source
- Sharing cached server state across components
- Automatic background refetching on window focus, reconnect, or mount
- Polling at a fixed interval
- Dependent queries (disabled until prerequisites are met)
- Selecting/transforming a subset of the fetched data

**Do NOT use for server-side mutations** — use `useMutation` instead.

## Basic Usage

```tsx
import { useQuery } from '@tanstack/react-query'

function Todos() {
  const { isPending, isError, data, error } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodoList,
  })

  if (isPending) return <span>Loading...</span>
  if (isError) return <span>Error: {error.message}</span>

  return (
    <ul>
      {data.map((todo) => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  )
}
```

### Query Keys — the heart of caching

Query keys are **arrays** serializable via `JSON.stringify`. They uniquely identify cached data and act as dependencies for automatic refetching.

```tsx
// Simple key — for lists / non-hierarchical resources
useQuery({ queryKey: ['todos'], queryFn: fetchTodos })

// Key with variable — for a single item
useQuery({ queryKey: ['todo', todoId], queryFn: () => fetchTodo(todoId) })

// Key with object params — for filtered lists
useQuery({ queryKey: ['todos', { status: 'done' }], queryFn: fetchTodos })
```

**Deterministic hashing rules:**
- Object key order inside a query key object does **not** matter — `{status, page}` equals `{page, status}`
- Array item order **does** matter
- `undefined` values in arrays affect equality

**Golden rule:** every variable your `queryFn` depends on must be in the `queryKey`.

### Query Function — any function returning a Promise

```tsx
// Using fetch (must throw on non-ok manually)
useQuery({
  queryKey: ['todos', todoId],
  queryFn: async () => {
    const response = await fetch('/todos/' + todoId)
    if (!response.ok) throw new Error('Network response was not ok')
    return response.json()
  },
})

// Access queryKey via QueryFunctionContext
function fetchTodoList({ queryKey }) {
  const [_key, { status, page }] = queryKey
  // ...
}
```

### Two status dimensions: `status` + `fetchStatus`

| `status` (about the **data**) | `fetchStatus` (about the **queryFn**) |
|---|---|
| `pending` — no data yet | `fetching` — queryFn is running |
| `error` — fetch errored | `paused` — wanted to fetch but paused (e.g. offline) |
| `success` — data available | `idle` — not doing anything |

These combine freely. A `success`/`fetching` query means a background refetch is in progress. A `pending`/`paused` query means no data and the network is unavailable.

**Key derived booleans:**
- `isLoading` = `isFetching && isPending` (first load only)
- `isRefetching` = `isFetching && !isPending` (background refetch)

## Key APIs (Summary)

### useQuery Options (most important)

| Option | Default | What it does |
|---|---|---|
| `queryKey` | **required** | Unique key array; change triggers refetch |
| `queryFn` | **required*** | Promise-returning function; must not return `undefined` |
| `staleTime` | `0` | ms before data is considered stale. `Infinity` = never stale. `'static'` = never stale (blocks all auto-refetch) |
| `gcTime` | `5 min` | ms before inactive cache is garbage-collected. `Infinity` disables GC |
| `enabled` | `true` | `false` pauses the query (use for dependent queries) |
| `retry` | `3` (client) / `0` (server) | Max retry count on failure; `true` = infinite, `false` = none |
| `retryDelay` | — | Function: `(attempt, error) => ms`. Exponential: `attempt => Math.min(attempt > 1 ? 2 ** attempt * 1000 : 1000, 30 * 1000)` |
| `refetchOnMount` | `true` | `"always"` forces refetch even if fresh (except `staleTime: 'static'`) |
| `refetchOnWindowFocus` | `true` | Refetch on tab focus if stale |
| `refetchOnReconnect` | `true` | Refetch on network reconnect if stale |
| `refetchInterval` | — | Polling interval in ms |
| `initialData` | — | **Persisted** to cache, considered stale by default |
| `placeholderData` | — | Shown during `pending`, **NOT persisted** to cache |
| `select` | — | `(data) => transformed` — transforms returned `data` without touching cache. Wrap in `useCallback` |
| `networkMode` | `'online'` | `'always'` / `'offlineFirst'` |

### useQuery Return (most used)

| Field | Description |
|---|---|
| `data` | Last successfully resolved data (`undefined` initially) |
| `error` | Error object if thrown (`null` otherwise) |
| `status` | `'pending'` / `'error'` / `'success'` |
| `isPending` / `isError` / `isSuccess` | Boolean derivations of `status` |
| `fetchStatus` | `'fetching'` / `'paused'` / `'idle'` |
| `isLoading` | `isFetching && isPending` (first fetch in flight) |
| `isRefetching` | Background refetch in flight |
| `isStale` | Data older than `staleTime` |
| `refetch` | `() => Promise<UseQueryResult>` — manual trigger |

## Caveats

- **Data must not be `undefined`:** the queryFn must resolve data or throw — returning `undefined` is treated as no-data.
- **`fetch` requires manual error throwing:** unlike `axios`, native `fetch` does not throw on 4xx/5xx. Check `response.ok` and throw yourself.
- **`initialData` vs `placeholderData`:** `initialData` is cached and treated as real data; `placeholderData` is purely visual and vanishes on fetch.
- **`select` reference stability:** `select` re-runs on every render unless wrapped in `useCallback`.
- **`staleTime: 'static'` blocks `"always"` refetch:** setting `refetchOnMount: "always"` is ignored when `staleTime: 'static'`.
- **`isInitialLoading` is deprecated:** use `isLoading` instead.
- **Query key array order matters:** `['todos', status, page]` ≠ `['todos', page, status]` (but `{status, page}` equals `{page, status}` inside a key).

## Composition Hints

- **Dependent queries:** set `enabled: !!prerequisiteValue` to defer until a dependency exists.
- **Parallel queries:** call `useQuery` multiple times in the same component — TanStack Query parallelizes them automatically.
- **Shared cache:** two components using the same `queryKey` share one request and one cached result.
- **Prefetching:** use `queryClient.prefetchQuery({ queryKey, queryFn })` before navigation for instant data.
- **Query key factories:** in larger apps, organize keys with a factory pattern (e.g., `todoKeys.detail(id)`) for consistency.
- **Default query function:** set a `defaultQueryFn` on `QueryClient` so you can omit `queryFn` on individual queries when your API follows a convention (e.g., the query key maps to an endpoint).
