---
name: react-useTransition
description: Mark state updates as non-blocking Transitions to keep UI responsive during slow renders, with Suspense integration and pending-state tracking.
tech_stack: [react]
language: [javascript, typescript]
capability: [routing, state-management, data-fetching]
version: "React 18+"
collected_at: 2025-01-01
---

# useTransition

> Source: https://react.dev/reference/react/useTransition

## Purpose
`useTransition` marks state updates as **non-blocking Transitions**. React deprioritizes them — they won't block clicks or typing, and are interruptible if a new urgent interaction arrives.

The key Suspense behavior: if a component suspends during a Transition, React keeps showing the **already-revealed content** instead of flashing a fallback spinner. The fallback only appears once new data is ready and committed.

## When to Use
- **Tab/route navigation with Suspense:** wrap `setTab`/`setPage` in `startTransition` so the current view stays visible instead of being replaced by a spinner.
- **Inline pending indicators:** use `isPending` to dim buttons, show spinners, or disable inputs while a slow update runs.
- **Async actions (API calls):** keep the UI interactive during slow server operations; the user can click away or change their mind.
- **Suspense-enabled routers:** page navigations should always be wrapped in Transitions by default.

## Basic Usage

### Tab navigation (prevents fallback flash)
```js
import { useState, useTransition, Suspense } from 'react';

function TabContainer() {
  const [tab, setTab] = useState('about');
  const [isPending, startTransition] = useTransition();

  function selectTab(nextTab) {
    startTransition(() => setTab(nextTab));
  }

  return (
    <Suspense fallback={<Spinner />}>
      <button onClick={() => selectTab('posts')}
              className={isPending ? 'dimmed' : ''}>
        Posts
      </button>
      {tab === 'about' && <AboutTab />}
      {tab === 'posts' && <PostsTab />}
    </Suspense>
  );
}
```
Without the Transition, clicking "Posts" would replace the entire tab container with the Suspense fallback. With it, the current tab stays visible, and `isPending` drives inline feedback.

### Exposing an `action` prop (pattern for reusable buttons)
```js
function TabButton({ action, children, isActive }) {
  const [isPending, startTransition] = useTransition();

  if (isActive) return <b>{children}</b>;
  if (isPending) return <b className="pending">{children}</b>;

  return (
    <button onClick={async () => {
      startTransition(async () => { await action(); });
    }}>
      {children}
    </button>
  );
}
```
The parent sets state inside `action`, so the update is automatically a Transition. Always `await action()` so both sync and async parents work.

### Non-blocking async update
```js
const [isPending, startTransition] = useTransition();

function onSubmit(newQuantity) {
  startTransition(async () => {
    const saved = await updateQuantity(newQuantity);
    startTransition(() => setQuantity(saved)); // wrap after await!
  });
}
```

## Key APIs (Summary)
- **`const [isPending, startTransition] = useTransition()`** — Hook; `isPending` is `true` while at least one Transition is in progress.
- **`startTransition(action)`** — marks all synchronous `set` calls inside `action` as Transitions. Has a stable identity.
- **`startTransition` (standalone import)** — same behavior without `isPending`. Use outside components (data libraries, etc.).

## Caveats
- **Cannot control text inputs.** Input `onChange` must be synchronous. Use two state variables (one sync, one Transition) or `useDeferredValue` instead.
- **After `await`, re-wrap `set` calls** in another `startTransition`. React loses the async context:
  ```js
  // ❌ setPage not a Transition
  startTransition(async () => { await fetch(); setPage('/'); });
  // ✅ correct
  startTransition(async () => { await fetch(); startTransition(() => setPage('/')); });
  ```
- **The function passed to `startTransition` must be synchronous** overall. `setTimeout(() => setX())` inside it won't be a Transition.
- **Must have access to the `set` function** of the state you're updating. For deferring values from props/other hooks, use `useDeferredValue`.
- **Transitions only "wait" for already-revealed content.** Nested `<Suspense>` boundaries that haven't rendered yet will still show their fallback.
- **Multiple Transitions are batched together** (current React limitation — may change).
- **Request ordering:** rapid async Transitions may complete out of order. Built-in solutions like `useActionState`, `<form>` actions, and Server Functions handle this automatically.
- **`startTransition` executes immediately** (synchronously). Code after the call runs after; this is expected: `console.log(1); startTransition(() => { console.log(2) }); console.log(3)` → 1,2,3.

## Composition Hints
- **With `useDeferredValue`:** `useTransition` marks an entire update as non-urgent (navigation, tab switches). `useDeferredValue` defers a single value in an otherwise-urgent update (search input). They complement each other — use `useDeferredValue` when you can't access the `set` function.
- **With `<Suspense>`:** Transitions prevent already-visible content from being hidden by a fallback. This is the recommended pattern for Suspense-enabled navigation.
- **With error boundaries:** errors thrown inside `startTransition` bubble to the nearest `<ErrorBoundary>`. Wrap the component calling `useTransition` in an error boundary for graceful error display.
- **With `useOptimistic`:** use `useOptimistic` inside Transitions to show immediate UI feedback while the async action completes.
