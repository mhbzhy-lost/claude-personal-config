---
name: tanstack-query-ssr
description: Server-side rendering and hydration patterns for TanStack Query v5 — dehydrate cache on server, hydrate on client with HydrationBoundary, and avoid SSR/CSR data mismatches.
tech_stack: [react]
language: typescript
capability: [data-fetching, state-management]
version: "TanStack Query v5"
collected_at: 2025-01-01
---

# TanStack Query SSR & Hydration

> Source: https://tanstack.com/query/latest/docs/framework/react/reference/hydration

## Purpose

TanStack Query's SSR primitives allow you to prefetch data on the server, serialize the entire QueryClient cache, and rehydrate it on the client — eliminating loading spinners on first render and making pre-populated content SEO-friendly.

## When to Use

- **SSR/SSG with Next.js, Remix, or custom Node servers** — prefetch data before sending HTML.
- **Avoiding loading states on initial render** — the client picks up where the server left off.
- **Streaming SSR** — progressively hydrate queries as they resolve (Next.js App Router + `ReactQueryStreamedHydration`).
- **Persisting cache to storage** — `dehydrate`/`hydrate` to/from `localStorage` or similar.

## Basic Usage

### Standard SSR Pattern (Next.js Pages Router)

```tsx
// pages/posts.tsx
import { dehydrate, HydrationBoundary, QueryClient, useQuery } from '@tanstack/react-query'

export async function getServerSideProps() {
  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({ queryKey: ['posts'], queryFn: fetchPosts })
  return { props: { dehydratedState: dehydrate(queryClient) } }
}

export default function Posts({ dehydratedState }) {
  return (
    <HydrationBoundary state={dehydratedState}>
      <PostsList />
    </HydrationBoundary>
  )
}

function PostsList() {
  const { data } = useQuery({ queryKey: ['posts'], queryFn: fetchPosts })
  return <div>{data.map(p => <Post key={p.id} {...p} />)}</div>
}
```

The key sequence:
1. Create a fresh `QueryClient` per request
2. `prefetchQuery` (or `prefetchInfiniteQuery`) to populate it
3. `dehydrate(queryClient)` to produce a serializable state snapshot
4. Pass it as a page prop and wrap the tree in `<HydrationBoundary state={...}>`

## Key APIs (Summary)

### `dehydrate(queryClient, options?)`

Serializes the QueryClient cache into a `DehydratedState`. **Only successful queries are included by default.**

```ts
const state = dehydrate(queryClient, {
  shouldDehydrateQuery: (q) => true,    // include errors/pending too
  shouldDehydrateMutation: (m) => true, // include mutations (default: paused only)
  serializeData: (data) => data,         // transform data before serialization
  shouldRedactErrors: () => false,       // set false to include error details
})
```

### `hydrate(queryClient, dehydratedState, options?)`

Programmatically merges dehydrated state into a cache. **Only overwrites if dehydrated data is newer** than what's already cached.

```ts
hydrate(queryClient, dehydratedState, {
  defaultOptions: { queries: { staleTime: 60_000 } },
  deserializeData: (data) => data,
})
```

### `<HydrationBoundary state={dehydratedState} options? />`

React component — the idiomatic way to hydrate on the client. Reads QueryClient from context via `useQueryClient()`. **Only hydrates queries, not mutations.**

## Caveats

- **Only successful queries are dehydrated by default.** Pass `shouldDehydrateQuery: () => true` to include pending/error states.
- **HydrationBoundary does NOT hydrate mutations.** Use `hydrate()` directly if you need mutation state.
- **hydrate won't clobber newer client data.** Merge is timestamp-based — stale dehydrated data is silently ignored.
- **DehydratedState format is NOT a public API contract** — don't parse or mutate it directly.
- **Errors are redacted by default** via `shouldRedactErrors`. Set `() => false` to preserve them across the wire.
- **Non-JSON types (Error, undefined, Date) need custom serialize/deserialize** if persisting to `localStorage` or similar.
- **Create a new QueryClient per server request** — reuse across requests causes cross-user data leaks.
- **Match defaultOptions on server and client** — mismatched `staleTime`/`gcTime` cause unnecessary refetches after hydration.

## Composition Hints

- **App Router (Next.js 13+):** Use `ReactQueryStreamedHydration` for progressive hydration with streaming. Prefetch in Server Components, wrap client tree in both `QueryClientProvider` and `HydrationBoundary`.
- **Always create the QueryClient inside the request handler** (not at module scope). In App Router, use `@tanstack/react-query`'s dedicated Next.js helpers or a `useState` lazy initializer to avoid sharing state.
- **Prefetch at the page/route level**, not deep in component trees — this keeps data requirements colocated with route definitions.
- **For `localStorage` persistence:** combine `dehydrate`/`hydrate` with `persistQueryClient` plugin rather than hand-rolling serialization.
- **Compose with Suspense boundaries:** wrap `<HydrationBoundary>` inside `<Suspense>` when using streaming to show fallbacks for queries that haven't resolved yet.
