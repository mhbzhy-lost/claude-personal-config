---
name: react-useEffect
description: React useEffect and useLayoutEffect Hooks — synchronize components with external systems, manage side effects, and measure DOM layout before paint.
tech_stack: [react]
language: [javascript, typescript]
capability: [data-fetching]
version: "React 18/19"
collected_at: 2025-01-01
---

# useEffect / useLayoutEffect

> Source: https://react.dev/reference/react/useEffect, https://react.dev/reference/react/useLayoutEffect

## Purpose

`useEffect` synchronizes a component with **external systems** — anything outside React's render tree: network connections, browser APIs, third-party widgets, timers, event subscriptions. It runs **after** the browser paints (non-blocking).

`useLayoutEffect` is the synchronous variant — it fires **after DOM mutations but before the browser paints**, blocking the screen until the Effect (and any queued state updates) complete. Use it only for DOM measurement that must be invisible to the user.

## When to Use

### useEffect — the default choice for:
- Connecting to external services (chat, analytics, WebSocket)
- Adding/removing event listeners on `window` or `document`
- Starting/stopping timers (`setInterval`/`setTimeout`)
- Integrating with non-React libraries (map widgets, animation engines, vanilla JS components)
- Fetching data on mount (though frameworks, TanStack Query, or SWR are better options)

### useLayoutEffect — only when:
- You need to **measure DOM geometry** (position, size) and adjust rendering before the user sees anything
- Classic example: tooltip positioning — render at (0,0), measure height, reposition above/below, all before paint
- Any scenario where `useEffect` causes a visible "flicker" because the user sees the pre-adjustment state

### When NOT to use an Effect at all:
- **Deriving data**: if a value can be computed from props/state during render, compute it directly
- **Resetting state on prop change**: use `key` prop to remount the component
- **Reacting to user events**: handle side effects in the event handler itself
- **Chaining state updates**: reconsider your state design; often a single `useReducer` dispatch is cleaner

## Basic Usage

### Connecting to an external system

```jsx
import { useState, useEffect } from 'react';

function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234');

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId);
    connection.connect();

    return () => connection.disconnect(); // cleanup
  }, [serverUrl, roomId]); // re-connect when either changes

  // ...
}
```

### Effect lifecycle

```
Mount:           setup()
Deps change:     cleanup(oldValues) → setup(newValues)
Unmount:         cleanup()
```

In **Strict Mode (dev only)**: React runs an extra `setup → cleanup → setup` cycle on mount to verify cleanup logic. If this breaks your Effect, your cleanup function is incomplete.

### Dependency array patterns

```jsx
useEffect(() => { ... }, [dep1, dep2]);  // runs on mount + when deps change
useEffect(() => { ... }, []);             // runs once on mount + cleanup on unmount
useEffect(() => { ... });                 // runs after every render (rarely correct)
```

**The linter rule:** every reactive value (props, state, component-scoped variables) used inside the Effect must appear in the dependency array. Don't suppress the `react-hooks/exhaustive-deps` lint rule — missing deps cause stale closures.

### Removing unnecessary object/function dependencies

```jsx
// 🚩 options object recreated every render → Effect fires every render
const options = { serverUrl, roomId };
useEffect(() => {
  const conn = createConnection(options);
  conn.connect();
  return () => conn.disconnect();
}, [options]);

// ✅ Move object creation inside the Effect
useEffect(() => {
  const options = { serverUrl, roomId };
  const conn = createConnection(options);
  conn.connect();
  return () => conn.disconnect();
}, [serverUrl, roomId]);
```

### Fetching data with race-condition guard

```jsx
useEffect(() => {
  let ignore = false;

  async function startFetching() {
    const result = await fetchBio(person);
    if (!ignore) { setBio(result); }
  }

  startFetching();
  return () => { ignore = true; };
}, [person]);
```

The `ignore` flag prevents a stale response from overwriting state when the dependency changes before the request completes. Without this, rapidly switching `person` could flash the wrong bio.

### useLayoutEffect: measuring layout before paint

```jsx
import { useRef, useLayoutEffect, useState } from 'react';

function Tooltip({ children, targetRect }) {
  const ref = useRef(null);
  const [tooltipHeight, setTooltipHeight] = useState(0);

  // Measure after DOM commit, but before browser paint
  useLayoutEffect(() => {
    const { height } = ref.current.getBoundingClientRect();
    setTooltipHeight(height); // triggers synchronous re-render
  }, []);

  // Calculate final position using measured height
  let tooltipY = targetRect.top - tooltipHeight;
  if (tooltipY < 0) { tooltipY = targetRect.bottom; }

  return createPortal(
    <TooltipContainer x={targetRect.left} y={tooltipY} contentRef={ref}>
      {children}
    </TooltipContainer>,
    document.body
  );
}
```

The two-pass render (initial → measure → final) happens entirely before the browser paints, so the user never sees the tooltip jump.

## Key APIs (Summary)

| Hook | Timing | Blocks paint | Primary use |
|------|--------|-------------|-------------|
| `useEffect(setup, deps?)` | After paint (async) | No | External sync, subscriptions, fetches |
| `useLayoutEffect(setup, deps?)` | After DOM, before paint (sync) | Yes | DOM measurement, layout fixups |
| `useInsertionEffect(setup, deps?)` | Before DOM mutation | Yes | CSS-in-JS style injection (library internals) |

## Caveats

### 1. Effects only run on the client
Effects do **not** run during server-side rendering. Server-rendered HTML will show the pre-Effect state. For `useLayoutEffect`, this causes the warning: *"useLayoutEffect does nothing on the server"*. Mitigations:
- Replace with `useEffect` if the visual flicker is tolerable
- Mark component as client-only behind `<Suspense>`
- Use `isMounted` boolean pattern with a `useEffect` to gate layout-dependent rendering

### 2. Infinite re-render loops
Setting state inside an Effect that depends on that same state value causes an infinite loop:

```jsx
// 🚩 Infinite loop
useEffect(() => {
  setCount(count + 1);
}, [count]);

// ✅ Use updater function (removes the dependency)
useEffect(() => {
  setCount(c => c + 1);
}, []);

// ✅ Better: rethink whether an Effect is needed at all
```

### 3. Object/function identity in deps
Objects, arrays, and functions created during render have new identity every render. This makes Effects re-run unnecessarily. Solutions:
- Move the value **inside** the Effect
- For functions: wrap with `useCallback` and include the memoized function in deps
- For derived objects: use `useMemo`

### 4. Effect vs event handler
If work should happen in response to a specific user action (click, submit), put it in the event handler — not in an Effect watching some state that the handler sets.

### 5. Cleanup runs on re-render, not just unmount
When dependencies change, React runs cleanup with old values before setup with new values. This is by design — don't be surprised when cleanup fires without unmount.

### 6. useLayoutEffect blocks paint
Excessive `useLayoutEffect` usage degrades performance. The browser can't paint until all `useLayoutEffect` callbacks (and their state updates) complete. Always default to `useEffect` and only upgrade when there's a measurable visual flicker.

## Composition Hints

- **With useRef**: use refs to hold mutable values (timers, DOM nodes, `ignore` flags) that shouldn't trigger Effect re-runs.

- **With useState**: Effects often set state, but avoid setting state that the Effect also depends on (infinite loop).

- **Custom Hooks are the primary encapsulation pattern**: wrap an Effect in a custom Hook to hide the imperative logic behind a declarative API. The ecosystem (and your codebase) benefits from reusable `useChatRoom`, `useWindowListener`, `useIntersectionObserver`, etc.

- **Data fetching**: direct `fetch` in Effects is the simplest approach but doesn't scale. For production, prefer:
  - Framework built-in data loading (Next.js, Remix)
  - TanStack Query / React Query
  - SWR
  - RTK Query

- **With Strict Mode**: always implement proper cleanup. If your Effect subscribes, it must unsubscribe. If it connects, it must disconnect. The dev-only double-invocation is a stress test — passing it ensures production correctness.
