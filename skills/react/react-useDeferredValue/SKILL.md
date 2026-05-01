---
name: react-useDeferredValue
description: Defer updating a part of the UI to keep it responsive during high-frequency changes, integrated with Suspense.
tech_stack: [react]
language: [javascript, typescript]
capability: [data-fetching, state-management]
version: "React 18+"
collected_at: 2025-01-01
---

# useDeferredValue

> Source: https://react.dev/reference/react/useDeferredValue, https://react.dev/reference/react/Suspense

## Purpose
`useDeferredValue` returns a deferred version of a value that "lags behind" the original during updates. React first re-renders with the old deferred value, then tries a background re-render with the new value. The background render is interruptible — new updates (e.g. keystrokes) abandon and restart it.

Deeply integrated with `<Suspense>`: if the background update suspends, the user sees the old deferred value rather than a fallback spinner.

Unlike debouncing/throttling, there is **no fixed delay** — it adapts to device speed and is interruptible by default.

## When to Use
- **Suspense-driven search/deferred loading:** keep showing previous results while new data fetches, avoiding layout-jarring spinners.
- **Stale-content indicators:** compare `value !== deferredValue` to dim or transition content while it's stale.
- **Deferring expensive re-renders:** when a slow component (chart, long list) re-renders on every keystroke, `useDeferredValue` keeps the input snappy. The slow component **must be wrapped in `memo`**.

## Basic Usage
```js
import { useState, useDeferredValue, Suspense } from 'react';

function SearchPage() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <Suspense fallback={<Spinner />}>
        <SearchResults query={deferredQuery} />
      </Suspense>
    </>
  );
}
```
The input updates immediately via `query`. `SearchResults` receives `deferredQuery`, which holds the previous value until new data loads — no fallback flash.

### Stale indicator
```js
const isStale = query !== deferredQuery;
<div style={{ opacity: isStale ? 0.5 : 1 }}>
  <SearchResults query={deferredQuery} />
</div>
```

### Deferring a slow list (requires `memo`)
```js
const SlowList = memo(function SlowList({ text }) { /* ... */ });

function App() {
  const [text, setText] = useState('');
  const deferredText = useDeferredValue(text);
  return (
    <>
      <input value={text} onChange={e => setText(e.target.value)} />
      <SlowList text={deferredText} />
    </>
  );
}
```

## Key APIs (Summary)
- **`useDeferredValue(value)`** — returns deferred `value`. During initial render same as `value`; during updates lags behind.
- **`useDeferredValue(value, initialValue?)`** (React 19+) — `initialValue` used on the very first render so deferring happens from the start.
- Comparison is via `Object.is`. A different value triggers the two-phase (current → background) render cycle.

## Caveats
- **Inside a Transition, always returns the new value** — no deferred render is spawned since the Transition itself already defers.
- **Only pass primitives or objects created outside rendering.** New objects created during render differ every time by `Object.is`, causing pointless background re-renders.
- **Does NOT reduce network requests.** Every keystroke still fires requests; only the UI update is deferred. (Responses are cached, so backspacing is instant.)
- **`memo` is mandatory** when deferring expensive components — without it the component re-renders on every parent render, defeating the optimization.
- **Background Effects don't fire until committed.** If the background render suspends, Effects run only after data loads.
- **No fixed delay** — React starts the background render immediately after the original render finishes.

## Composition Hints
- **Pair with `useTransition`:** `useTransition` marks whole updates as non-urgent (good for navigation); `useDeferredValue` defers a single value within an otherwise-urgent update (good for search inputs, charts).
- **Pair with `memo`:** always wrap the receiving component in `memo` when using `useDeferredValue` as a performance optimization.
- **Pair with `<Suspense>`:** the integration is automatic — if the background render suspends, no fallback is shown. This enables stale-while-revalidate patterns without extra wiring.
- **Stale detection:** `isStale = value !== deferredValue` drives visual feedback (opacity, spinners, skeleton states).
