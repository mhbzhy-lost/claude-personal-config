---
name: tanstack-query-queryclient-cache
description: QueryClient cache management — invalidation, refetching, setQueryData, removeQueries, cancelQueries, filter matching, and the stale-while-revalidate lifecycle.
tech_stack: [react]
language: [typescript]
capability: [data-fetching]
version: "TanStack Query v5"
collected_at: 2025-07-16
---

# QueryClient & Cache Management

> Source: https://tanstack.com/query/latest/docs/framework/react/reference/QueryClient, https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation, https://tanstack.com/query/latest/docs/framework/react/guides/caching, https://tanstack.com/query/latest/docs/framework/react/guides/filters

## Purpose

The `QueryClient` is the central cache manager in TanStack Query. It holds all query and mutation caches, provides methods to imperatively manipulate them (invalidate, refetch, remove, update, cancel, reset), and controls the stale-while-revalidate lifecycle governed by `staleTime` and `gcTime`.

## When to Use

- **Invalidating queries after mutations** — the primary post-mutation pattern
- **Manually seeding/updating cache** (`setQueryData`) — optimistic updates, cache hydration
- **Removing cached queries** (`removeQueries`) — cleanup stale data
- **Cancelling in-flight fetches** (`cancelQueries`) — before optimistic updates
- **Prefetching** (`prefetchQuery` / `prefetchInfiniteQuery`) — hover/predictive preloading
- **Inspecting fetch/mutation status** (`isFetching` / `isMutating`) — global loading indicators
- **Resetting the cache** (`resetQueries` / `clear`) — user logout, cache purge

## Basic Usage

```tsx
import { useQueryClient } from '@tanstack/react-query'

function TodoActions() {
  const queryClient = useQueryClient()

  // After creating a todo, invalidate the list
  const handleCreate = async (todo) => {
    await api.createTodo(todo)
    queryClient.invalidateQueries({ queryKey: ['todos'] })
  }

  // Optimistic update + invalidate
  const handleToggle = async (id) => {
    // 1. Cancel in-flight fetches to avoid overwrite
    await queryClient.cancelQueries({ queryKey: ['todos'] })
    // 2. Snapshot current data for rollback
    const previous = queryClient.getQueryData(['todos'])
    // 3. Optimistically update
    queryClient.setQueryData(['todos'], (old) => ({
      ...old,
      items: old.items.map(t => t.id === id ? { ...t, done: !t.done } : t),
    }))
    // 4. Fire mutation, invalidate on settle
    try {
      await api.toggleTodo(id)
    } catch {
      queryClient.setQueryData(['todos'], previous) // rollback
    }
    queryClient.invalidateQueries({ queryKey: ['todos'] })
  }

  return (/* ... */)
}
```

## Key APIs (Summary)

### Core Mutation Methods

| Method | Effect |
|---|---|
| `invalidateQueries(filters?)` | Marks matching queries as stale; refetches if currently rendered |
| `refetchQueries(filters?)` | Force-refetches matching queries regardless of staleness |
| `cancelQueries(filters?)` | Cancels ongoing fetches for matching queries |
| `removeQueries(filters?)` | Deletes matching queries from the cache entirely |
| `resetQueries(filters?)` | Resets matching queries to their initial state |

### Cache Read/Write

| Method | Notes |
|---|---|
| `setQueryData(key, updater)` | Imperatively write to cache. `updater` can be a value or `(old) => new` |
| `getQueryData(key)` | Synchronously read from cache. Returns `undefined` if no cache exists |
| `getQueriesData(filters?)` | Returns `[queryKey, data][]` for all matching queries |

### Bulk Operations

| Method | Notes |
|---|---|
| `clear()` | Removes **all** queries from the cache |
| `isFetching(filters?)` | Returns count of currently fetching queries |
| `isMutating(filters?)` | Returns count of in-flight mutations |

### Prefetching

| Method | Notes |
|---|---|
| `prefetchQuery(options)` | Fetch and cache data before it's needed |
| `prefetchInfiniteQuery(options)` | Same for infinite queries |

### Query Filters (used by all methods above)

| Property | Type | Description |
|---|---|---|
| `queryKey?` | `QueryKey` | **Prefix match** by default; use `exact: true` for precise match |
| `exact?` | `boolean` | Match only the exact query key |
| `type?` | `'active' \| 'inactive' \| 'all'` | Default `'all'`. `active` = currently rendered by a hook |
| `stale?` | `boolean` | `true` = match stale, `false` = match fresh |
| `fetchStatus?` | `'fetching' \| 'paused' \| 'idle'` | Filter by current network state |
| `predicate?` | `(query: Query) => boolean` | Custom function; if used alone, runs against every cached query |

### Mutation Filters

| Property | Type |
|---|---|
| `mutationKey?` | `MutationKey` |
| `exact?` | `boolean` |
| `status?` | `'idle' \| 'pending' \| 'success' \| 'error'` |
| `predicate?` | `(mutation: Mutation) => boolean` |

### Caching Parameters (set on QueryClient or per-query)

| Parameter | Default | Meaning |
|---|---|---|
| `staleTime` | `0` | How long (ms) before data is considered stale. `0` = immediately stale after fetch |
| `gcTime` | `5 * 60 * 1000` | How long (ms) inactive cache data survives before garbage collection |

## Caveats

- **Prefix matching is the default**: `invalidateQueries({ queryKey: ['todos'] })` matches `['todos']`, `['todos', { page: 1 }]`, and `['todos', 'done', { filter: 'x' }]`. Use `exact: true` to match only the exact key.
- **Invalidation only refetches active queries**: Inactive queries are marked stale but won't refetch until a component subscribes to them again.
- **`cancelQueries` before `setQueryData`**: When doing optimistic updates, always cancel in-flight fetches first to prevent them from overwriting your optimistic data.
- **`setQueryData` must match the data shape**: For infinite queries, maintain `{ pages, pageParams }` structure. For regular queries, maintain whatever shape the query function returns.
- **Structural sharing**: By default, if the new data is deeply equal to the old, the old reference is kept — `setQueryData` won't trigger re-renders for identical data.
- **`gcTime` is not `cacheTime`**: Renamed in v5. `gcTime` controls garbage collection timeout for inactive queries.
- **Shared cache entry**: Multiple `useQuery` hooks with the same `queryKey` share one cache entry. All will reflect the same `isFetching` state during background refetches.

## Composition Hints

- **Post-mutation pattern**: `mutation.onSuccess` → `queryClient.invalidateQueries({ queryKey: ['resource'] })`. This is the simplest and most reliable pattern.
- **Optimistic update pattern**: `cancelQueries` → `getQueryData` (snapshot) → `setQueryData` (optimistic) → mutation → `invalidateQueries` on settle, with `setQueryData` rollback on error.
- **Selective invalidation**: Use `exact: true` or `predicate` when you only want to affect a subset of queries under the same key prefix.
- **Global loading indicator**: `const isFetching = useIsFetching()` or `queryClient.isFetching()` to show a spinner whenever any query is fetching.
- **Cache seeding**: Use `queryClient.setQueryData(key, data)` before a component mounts to provide `initialData`-like behavior from a known data source (e.g., WebSocket push, parent component).
- **`refetchQueries` vs `invalidateQueries`**: Use `invalidateQueries` when data *may* be stale (respects active/inactive distinction). Use `refetchQueries` when you need a forced refetch regardless.
