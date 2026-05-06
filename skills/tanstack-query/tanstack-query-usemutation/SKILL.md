---
name: tanstack-query-usemutation
description: Create, update, and delete server data with side-effect orchestration, optimistic updates, and query invalidation using useMutation from TanStack Query v5.
tech_stack: [react]
language: typescript
capability: [data-fetching]
version: "TanStack Query v5"
collected_at: 2026-03-18
---

# useMutation (TanStack Query v5)

> Source: https://tanstack.com/query/latest/docs/framework/react/guides/mutations, https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates, https://tanstack.com/query/latest/docs/framework/react/reference/useMutation

## Purpose

`useMutation` handles server-side **write operations** — create, update, delete — and arbitrary side-effects. Unlike queries (which fetch and cache), mutations are **imperative**: you call `mutate()` to trigger them. They integrate deeply with the query cache for automatic invalidation and optimistic updates.

## When to Use

- Creating, updating, or deleting server resources
- Server side-effects that are not pure data reads
- Invalidating/refetching cached queries after a mutation succeeds
- Optimistic UI updates (show the change before the server confirms)
- Chaining side effects (analytics, navigation) after mutation completion
- Offline-capable mutations that persist and retry

**Do NOT use for data fetching** — use `useQuery` instead.

## Basic Usage

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'

function AddTodo() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (newTodo) => axios.post('/todos', newTodo),
    onSuccess: () => {
      // Invalidate and refetch the todos list
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  return (
    <div>
      {mutation.isPending && 'Adding todo...'}
      {mutation.isError && <div>Error: {mutation.error.message}</div>}
      {mutation.isSuccess && <div>Todo added!</div>}

      <button
        onClick={() => mutation.mutate({ title: 'Do Laundry' })}
      >
        Create Todo
      </button>
    </div>
  )
}
```

### Mutation States

| State | Meaning |
|---|---|
| `idle` | Fresh/reset, not yet triggered |
| `pending` | Mutation function is executing |
| `success` | Last attempt succeeded; `data` is available |
| `error` | Last attempt failed; `error` is available |

Key derived values: `isIdle`, `isPending`, `isSuccess`, `isError`, `isPaused`, plus `data`, `error`, `variables`, `submittedAt`, `failureCount`.

## Key APIs (Summary)

### useMutation Options

| Option | Default | What it does |
|---|---|---|
| `mutationFn` | **required*** | `(variables, context) => Promise<TData>` — the async write operation |
| `onMutate` | — | Fires **before** `mutationFn`. Return a value to pass to `onError`/`onSettled` (used for rollback in optimistic updates) |
| `onSuccess` | — | `(data, variables, onMutateResult, context) => ...` — fires on success |
| `onError` | — | `(error, variables, onMutateResult, context) => ...` — fires on failure |
| `onSettled` | — | `(data, error, variables, onMutateResult, context) => ...` — fires after success OR error |
| `retry` | `0` | Unlike queries (default `3`), mutations do **not** retry by default. Set a number, `true`, or a function |
| `retryDelay` | — | `(retryAttempt, error) => ms` — exponential backoff pattern |
| `mutationKey` | — | `unknown[]` — key to inherit defaults from `queryClient.setMutationDefaults()` |
| `scope` | unique id | `{ id: string }` — mutations with the **same** scope run in **serial** |
| `networkMode` | `'online'` | `'always'` / `'offlineFirst'` — controls behavior when offline |
| `gcTime` | — | Time before inactive mutation cache is garbage-collected |
| `throwOnError` | — | `true` to throw to nearest React error boundary |
| `meta` | — | Arbitrary metadata stored on the mutation cache entry |

### useMutation Return

| Field | Description |
|---|---|
| `mutate` | `(variables, { onSuccess, onError, onSettled }) => void` — trigger the mutation |
| `mutateAsync` | Like `mutate` but returns `Promise<TData>` (resolves on success, rejects on error) |
| `reset` | `() => void` — clear `error` and `data`, return to `idle` state |
| `status` | `'idle'` / `'pending'` / `'success'` / `'error'` |
| `isIdle` / `isPending` / `isSuccess` / `isError` | Boolean derivations |
| `isPaused` | `true` if mutation paused due to network mode |
| `data` | Last successful response data |
| `error` | Last error thrown |
| `variables` | The variables passed to the last `mutate()` call — **persists on error** (useful for retry) |
| `submittedAt` | Timestamp of when `mutate` was called |
| `failureCount` / `failureReason` | Retry state |

### Lifecycle Callback Order

```
mutate() called
  → onMutate (can return rollback context)
    → mutationFn executes
      → onSuccess  OR  onError
        → onSettled (always)
```

If any callback returns a Promise, it is awaited before the next callback runs.

### Per-mutate Callbacks vs useMutation Callbacks

You can pass `onSuccess`/`onError`/`onSettled` to both `useMutation` and `mutate()`:

```tsx
useMutation({
  mutationFn: addTodo,
  onSuccess: () => { /* fires FIRST */ },
})

mutate(todo, {
  onSuccess: () => { /* fires SECOND (if component still mounted) */ },
})
```

**Critical:** Per-mutate callbacks fire only **once** for the **last** call in a batch of consecutive mutations, and only if the component is still mounted. Use `useMutation`-level callbacks when you need every call handled.

## Optimistic Updates

Two approaches, choose based on how many places show the data:

### Approach 1: Via the UI (simpler, single-component)

Use `variables` from the mutation result to render a temporary item while `isPending`:

```tsx
const { isPending, variables, mutate, isError } = useMutation({
  mutationFn: (text: string) => axios.post('/api/data', { text }),
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
})

// In JSX:
{isPending && <li style={{ opacity: 0.5 }}>{variables}</li>}
{isError && (
  <li style={{ color: 'red' }}>
    {variables}
    <button onClick={() => mutate(variables)}>Retry</button>
  </li>
)}
```

**Cross-component:** use `useMutationState` with a `mutationKey` to read `variables` elsewhere:
```tsx
const variables = useMutationState<string>({
  filters: { mutationKey: ['addTodo'], status: 'pending' },
  select: (mutation) => mutation.state.variables,
})
// Returns an Array — multiple mutations may run concurrently
```

### Approach 2: Via the Cache (multi-component, with rollback)

Manipulate the query cache directly in `onMutate`, snapshot for rollback in `onError`:

```tsx
const queryClient = useQueryClient()

useMutation({
  mutationFn: addTodo,
  onMutate: async (newTodo, context) => {
    // 1. Cancel outgoing refetches (prevent overwrite)
    await context.client.cancelQueries({ queryKey: ['todos'] })
    // 2. Snapshot current cache
    const previousTodos = context.client.getQueryData(['todos'])
    // 3. Optimistically write
    context.client.setQueryData(['todos'], (old) => [...old, newTodo])
    // 4. Return snapshot for rollback
    return { previousTodos }
  },
  onError: (err, newTodo, context, onMutateResult) => {
    // Roll back to snapshot
    context.client.setQueryData(['todos'], onMutateResult.previousTodos)
  },
  onSettled: () => {
    // Always sync with server
    context.client.invalidateQueries({ queryKey: ['todos'] })
  },
})
```

**Decision rule:** use the UI approach if only one component shows the optimistic change; use the cache approach if multiple components read the same query key.

## Caveats

- **No retry by default:** mutations default to `retry: 0`. Opt in explicitly.
- **`mutate` is async:** in React 16 and earlier, wrap `mutate` in a function before passing to event handlers (event pooling). Not an issue in React 17+.
- **`variables` survive errors:** the last `variables` persist in the mutation state, enabling retry UI. Call `reset()` to clear them.
- **Per-mutate callbacks and batching:** `mutate(todo, { onSuccess })` callbacks fire only for the **last** call in rapid succession. Use `useMutation`-level callbacks for per-call handling.
- **Fulfillment order ≠ call order:** `mutationFn` is async, so the order mutations resolve may differ from the order `mutate()` was called.
- **Scope for serialization:** mutations run in parallel by default. Set `scope: { id: '...' }` to serialize them.
- **Offline:** if mutations fail due to being offline, they retry in order when the device reconnects. Use `persistQueryClient` plugin and `setMutationDefaults`/`dehydrate`/`hydrate`/`resumePausedMutations` for full offline persistence.

## Composition Hints

- **Invalidation after mutation:** the most common pattern — `onSuccess: () => queryClient.invalidateQueries({ queryKey: [...] })`. Return the invalidation promise so the mutation stays `pending` until the refetch completes.
- **Optimistic then invalidate:** use `onMutate` for the optimistic write, `onSettled` for invalidation (ensures server truth even on success).
- **Reuse mutation defaults:** define common patterns with `queryClient.setMutationDefaults([key], { ... })` and reference via `useMutation({ mutationKey: [key] })`.
- **`mutateAsync` for chaining:** when you need to `await` a mutation result (e.g., in a form submit handler before navigation), use `mutateAsync`.
- **Reset after success dialog:** call `mutation.reset()` inside an effect or callback after the user acknowledges a success/error message.
