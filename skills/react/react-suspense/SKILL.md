---
name: react-suspense
description: React Suspense for declarative loading states — fallback rendering, nested boundary sequencing, Transition integration, lazy code splitting, and streaming SSR error handling.
tech_stack: [react]
language: [javascript]
capability: [data-fetching, routing, ui-feedback]
version: "React 19"
collected_at: 2025-01-01
---

# React Suspense & lazy

> Source: https://react.dev/reference/react/Suspense, https://react.dev/reference/react/lazy

## Purpose

`<Suspense>` displays a fallback UI while its children are loading. `lazy()` defers component code loading until first render. Together they enable declarative loading-state orchestration without manual `isLoading` flags.

## When to Use

- **Code splitting:** Lazy-load route-level or heavy components with `lazy()` + `<Suspense>`.
- **Data loading with frameworks:** Use with Relay, Next.js App Router, or any Suspense-enabled data source.
- **Loading sequences:** Nest `<Suspense>` boundaries to progressively reveal sections rather than blocking on one spinner.
- **Prevent layout-jarring fallback flashes:** Wrap navigation updates in `startTransition` so already-visible content stays visible while new content loads.

Do NOT wrap every single component — Suspense boundaries should match the designer's intended loading sequence, not be per-component.

## Basic Usage

### Code splitting with lazy

```jsx
import { lazy, Suspense } from 'react';

const HeavyChart = lazy(() => import('./HeavyChart.js'));

function Dashboard() {
  return (
    <Suspense fallback={<Skeleton />}>
      <HeavyChart data={data} />
    </Suspense>
  );
}
```

**Critical:** Always declare `lazy()` at module top-level. Declaring it inside a component body resets component state on every re-render.

The Promise returned by the `load` function must resolve to an object with a `.default` property that is a valid React component (function, `memo`, or `forwardRef`).

### Data loading fallback (framework-dependent)

```jsx
<Suspense fallback={<Loading />}>
  <Albums artistId={artist.id} />
</Suspense>
```

Only Suspense-enabled data sources trigger this: Relay, Next.js, `lazy`, and `use()`. Data fetched in `useEffect` or event handlers will NOT activate Suspense.

### Nested boundaries for loading sequences

```jsx
<Suspense fallback={<PageSpinner />}>
  <Biography artistId={id} />
  <Suspense fallback={<AlbumsSkeleton />}>
    <Albums artistId={id} />
  </Suspense>
</Suspense>
```

Outer boundary shows `PageSpinner` until Biography loads, then Albums shows its own skeleton. After all load, everything appears.

## Key APIs (Summary)

| API | Role |
|-----|------|
| `<Suspense fallback={node}>` | Wraps children; shows `fallback` when any child suspends |
| `lazy(() => import(...))` | Returns a component that suspends until its code loads |
| `startTransition(() => {...})` | Marks state update as non-urgent; prevents already-revealed content from hiding |
| `useTransition()` | Returns `[isPending, startTransition]` for pending-state indicators |
| `useDeferredValue(value)` | Returns a lagging version of `value`; keeps stale UI visible during updates |
| `key` prop on components | Resets Suspense boundaries on navigation to signal "different content" |

## Caveats

### Fallback can reappear on re-suspend
If a Suspense boundary was showing content and then suspends again, the fallback returns — UNLESS the update was wrapped in `startTransition` or uses `useDeferredValue`. Those APIs tell React "keep showing the old content."

### State is discarded on first-mount suspend
React does not preserve any state for renders that suspended before mounting. On resolution, React retries the suspended tree from scratch.

### Layout Effects are cleaned up during hide
When React hides already-visible content due to a re-suspend, it cleans up layout Effects. When content reappears, layout Effects re-fire. This ensures DOM-measuring Effects don't run against hidden content.

### Preventing fallback flashes on navigation

```jsx
// ❌ Jarring: entire page replaced by spinner on navigation
function navigate(url) {
  setPage(url);
}

// ✅ Smooth: old page stays until new page is ready
import { startTransition } from 'react';
function navigate(url) {
  startTransition(() => setPage(url));
}
```

Suspense-enabled routers (Next.js App Router, React Router v7) wrap navigation in Transitions automatically.

### Resetting boundaries with `key`

```jsx
// Different user profiles = different content = show fallback on switch
<ProfilePage key={userId} />
```

### `lazy` in client-only rendering

Components that should only render on the client can throw on the server inside a Suspense boundary:

```jsx
<Suspense fallback={<Loading />}>
  <ChatWidget />
</Suspense>

function ChatWidget() {
  if (typeof window === 'undefined') {
    throw Error('ChatWidget renders only on client.');
  }
  return <div>...</div>;
}
```

React uses the Suspense fallback in the server HTML and replaces it with the real component on the client. If the component errors on the client too, the error propagates to the nearest Error Boundary.

### Suspense does NOT detect Effect/event-handler fetching

```jsx
// ❌ This will NOT show Suspense fallback
function Albums() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/albums').then(r => r.json()).then(setData);
  }, []);
  // ...
}
```

Only framework-integrated data fetching (Next.js, Relay), `lazy()`, and `use()` activate Suspense.

## Composition Hints

- **Co-locate Suspense with data consumers, not data fetchers.** If `Albums` fetches its own data, the `<Suspense>` goes above `<Albums>`.
- **Nest boundaries from coarse to fine.** Root layout spinner → section skeleton → widget shimmer.
- **Use `useDeferredValue` for search/debounce patterns** — keeps stale results visible with a dimming indicator instead of flashing a spinner on every keystroke.
- **Use `useTransition` for navigation/filter changes** — gives `isPending` for inline progress indicators without hiding existing content.
- **Pair with Error Boundaries.** Suspense handles the loading state; Error Boundaries handle the failure state. Wrap Suspense children in an Error Boundary for complete coverage.
