---
name: tanstack-query-useinfinitequery
description: Infinite scroll and "load more" pagination with useInfiniteQuery hook — cursor/offset-based, bi-directional, page limiting, and manual cache updates.
tech_stack: [react]
language: [typescript]
capability: [data-fetching]
version: "TanStack Query v5"
collected_at: 2025-07-16
---

# useInfiniteQuery

> Source: https://tanstack.com/query/latest/docs/framework/react/reference/useInfiniteQuery, https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries

## Purpose

`useInfiniteQuery` extends `useQuery` for lists that additively load more data — infinite scroll, "Load More" buttons, and bi-directional pagination. Instead of replacing page data, it appends/prepends pages into `data.pages[]` and tracks page parameters in `data.pageParams[]`.

## When to Use

- Infinite scroll lists (load more as the user scrolls)
- "Load More" button UIs
- Bi-directional lists (e.g., chat history — load older and newer messages)
- Any paginated API where pages accumulate rather than replace each other
- Use **regular `useQuery`** with a changing query key for traditional page-at-a-time pagination instead

## Basic Usage

```tsx
import { useInfiniteQuery } from '@tanstack/react-query'

function Projects() {
  const {
    data,              // { pages: [...], pageParams: [...] }
    fetchNextPage,     // () => Promise
    hasNextPage,       // boolean — true if getNextPageParam returned a value
    isFetchingNextPage,// boolean — true only while loading the next page
    isFetching,        // boolean — any fetch in progress
    status,
    error,
  } = useInfiniteQuery({
    queryKey: ['projects'],
    queryFn: async ({ pageParam }) => {
      const res = await fetch(`/api/projects?cursor=${pageParam}`)
      return res.json()
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor, // return undefined/null when done
  })

  if (status === 'pending') return <p>Loading...</p>
  if (status === 'error') return <p>Error: {error.message}</p>

  return (
    <>
      {data.pages.map((page, i) => (
        <React.Fragment key={i}>
          {page.data.map(project => (
            <p key={project.id}>{project.name}</p>
          ))}
        </React.Fragment>
      ))}
      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage ? 'Loading more...' : hasNextPage ? 'Load More' : 'Nothing more'}
      </button>
    </>
  )
}
```

## Key APIs (Summary)

### Required options (beyond useQuery)

| Option | Signature | Notes |
|---|---|---|
| `initialPageParam` | `TPageParam` | Starting page param for the first fetch |
| `getNextPageParam` | `(lastPage, allPages, lastPageParam, allPageParams) => TPageParam \| undefined \| null` | Return next cursor/page number; return `undefined`/`null` to signal end |
| `queryFn` | `(context: QueryFunctionContext) => Promise<TData>` | Receives `{ pageParam }` in context |

### Optional options

| Option | Signature | Notes |
|---|---|---|
| `getPreviousPageParam` | `(firstPage, allPages, firstPageParam, allPageParams) => TPageParam \| undefined \| null` | Enables bi-directional pagination |
| `maxPages` | `number \| undefined` | Limit cached pages; oldest page evicted when limit exceeded. Requires both `getNextPageParam` and `getPreviousPageParam` if > 0 |

### Return values (in addition to useQuery returns)

| Property | Type | Notes |
|---|---|---|
| `data.pages` | `TData[]` | All fetched pages in order |
| `data.pageParams` | `unknown[]` | Page params for each page |
| `fetchNextPage` | `(options?) => Promise` | `options.cancelRefetch` (default `true`) — when `false`, ignores overlapping calls |
| `fetchPreviousPage` | `(options?) => Promise` | Same options as `fetchNextPage` |
| `hasNextPage` | `boolean` | `true` if `getNextPageParam` returned non-null/undefined |
| `hasPreviousPage` | `boolean` | `true` if `getPreviousPageParam` returned non-null/undefined |
| `isFetchingNextPage` | `boolean` | Distinguishes "load more" from background refresh |
| `isFetchingPreviousPage` | `boolean` | |
| `isFetchNextPageError` | `boolean` | |
| `isFetchPreviousPageError` | `boolean` | |
| `isRefetching` | `boolean` | `isFetching && !isPending && !isFetchingNextPage && !isFetchingPreviousPage` |

## Caveats

- **Guard `fetchNextPage` with `!isFetching`**: Calling `fetchNextPage` during an in-flight fetch risks overwriting background refreshes. Only one fetch per InfiniteQuery cache entry at a time. Pattern: `<List onEndReached={() => hasNextPage && !isFetching && fetchNextPage()} />`
- **Refetch is sequential**: When stale, pages refetch starting from page 1 sequentially to avoid stale cursors. If the cache is cleared, pagination restarts from `initialPageParam`.
- **`data` structure must be preserved in cache updates**: When using `setQueryData`, always keep `{ pages, pageParams }` shape. Slices must apply to both arrays in sync.
- **`initialData` / `placeholderData`** must match the `{ pages, pageParams }` structure.
- **`cancelRefetch: false`** enables concurrent fetches but may cause data races — only use when you understand the trade-off.
- **`maxPages`** needs both `getNextPageParam` and `getPreviousPageParam` defined for bi-directional eviction.

## Composition Hints

- **Offset-based APIs**: Use `pageParam` as a page number in `getNextPageParam`: `(lastPage, allPages, lastPageParam) => lastPage.length === 0 ? undefined : lastPageParam + 1`
- **Reversed order**: Use the `select` option: `select: (data) => ({ pages: [...data.pages].reverse(), pageParams: [...data.pageParams].reverse() })`
- **Post-mutation cache update**: Use `queryClient.setQueryData` maintaining the `{ pages, pageParams }` structure — e.g., filter an item from the correct page, or remove the first page with `.slice(1)` on both arrays.
- **Bi-directional**: Add `getPreviousPageParam` and `fetchPreviousPage` / `hasPreviousPage` / `isFetchingPreviousPage` for chat-like UIs.
- **Suspense variant**: Use `useSuspenseInfiniteQuery` for Suspense-based data fetching with the same API shape.
