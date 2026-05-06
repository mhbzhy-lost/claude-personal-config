---
name: tanstack-query-suspense
description: Use React Suspense with TanStack Query v5 for declarative data fetching — useSuspenseQuery, useSuspenseInfiniteQuery, error boundary integration, and SSR streaming.
tech_stack: [react]
language: [typescript]
capability: [data-fetching]
version: "TanStack Query v5"
collected_at: 2026-07-11
---

# TanStack Query — Suspense Mode

> Source: https://tanstack.com/query/latest/docs/framework/react/guides/suspense, https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseQuery, https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseInfiniteQuery

## Purpose

Combine TanStack Query with React's Suspense for Data Fetching to replace manual `isLoading`/`isError` branching with React's declarative `<Suspense>` and `<ErrorBoundary>` components. Dedicated suspense hooks guarantee `data` is always defined, giving cleaner TypeScript types.

## When to Use

- You want `<Suspense fallback={...}>` to handle loading states declaratively
- You want Error Boundaries to catch query errors without per-component try/catch
- You need `data` guaranteed non-undefined in TypeScript
- Server-side rendering with streaming (e.g., Next.js App Router)
- You are building a Render-as-you-fetch architecture with prefetching

**Avoid when:** you need conditional/disabled queries, `placeholderData`, or query cancellation — none are supported.

## Basic Usage

### Simple suspense query

```tsx
import { useSuspenseQuery } from '@tanstack/react-query'

function Todos() {
  const { data } = useSuspenseQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  })
  // data is guaranteed defined — no loading/error checks needed
  return <ul>{data.map(t => <li key={t.id}>{t.title}</li>)}</ul>
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <React.Suspense fallback={<p>Loading todos...</p>}>
        <Todos />
      </React.Suspense>
    </QueryClientProvider>
  )
}
```

### Error boundary integration

```tsx
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'

function App() {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ resetErrorBoundary }) => (
            <div>
              Failed to load!
              <button onClick={resetErrorBoundary}>Retry</button>
            </div>
          )}
        >
          <Todos />
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}
```

### Preventing fallback flash on key change

When the query key changes, wrap the update in `startTransition` to keep the previous data visible:

```tsx
import { startTransition } from 'react'

function onFilterChange(newFilter) {
  startTransition(() => setFilter(newFilter))
}
```

### Manual error re-throw (for all errors, not just no-data)

`useSuspenseQuery` only auto-throws when no cached data exists. To force all errors to the boundary:

```tsx
const { data, error, isFetching } = useSuspenseQuery({ queryKey, queryFn })
if (error && !isFetching) throw error
```

## Key APIs (Summary)

| Hook | Replaces | Missing options |
|------|----------|----------------|
| `useSuspenseQuery(options)` | `useQuery` | `enabled`, `placeholderData`, `throwOnError` (fixed) |
| `useSuspenseInfiniteQuery(options)` | `useInfiniteQuery` | `enabled`, `placeholderData`, `throwOnError`, `suspense` |
| `useSuspenseQueries(options)` | `useQueries` | Same exclusions |

**Return shape differences** from their non-suspense counterparts:
- `data` is always defined (never `undefined`)
- `isPlaceholderData` is absent
- `status` is only `success` or `error`

**QueryErrorResetBoundary** — wraps error boundaries; calls `reset()` to clear query errors so suspended components can remount and re-fetch.

**useQueryErrorResetBoundary()** — hook version; resets errors within the closest `QueryErrorResetBoundary`, or globally if none exists.

## Caveats

- **No `enabled`**: All suspense queries in a component fetch serially. For dependent queries, structure your components or keys so each query naturally depends on the previous one's resolved data.
- **No `placeholderData`**: Use `startTransition` when changing query keys to avoid the Suspense fallback replacing existing UI.
- **Cancellation broken**: Neither `useSuspenseQuery` nor `useSuspenseInfiniteQuery` supports query cancellation.
- **throwOnError default**: Only throws when `query.state.data === undefined`. If a query previously succeeded, stale refetches that fail won't trigger the boundary — manually re-throw if you need that.
- **QueryClient + Suspense race**: Don't use `useState` for the `QueryClient` if no Suspense boundary sits between the provider and the suspending component. React may discard the state on suspend. Use a module-level variable instead.
- **Server**: Always create a fresh `QueryClient` per request on the server; reuse across suspends on the browser.

## Composition Hints

- **With Next.js streaming SSR**: Install `@tanstack/react-query-next-experimental`, wrap children in `<ReactQueryStreamedHydration>`, and set `staleTime: 60 * 1000` in default query options so the client doesn't immediately refetch.
- **With `React.use()` (experimental)**: Enable via `experimental_prefetchInRender: true` on `QueryClient`; then call `React.use(query.promise)` inside a child component wrapped in `<Suspense>`.
- **Prefetching for Render-as-you-fetch**: Call `queryClient.prefetchQuery()` in route loaders or event handlers so data is already in cache before the component suspends.
- **Mutations + error boundaries**: Set `throwOnError: true` on `useMutation` to propagate mutation errors to the same error boundary.
