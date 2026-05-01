---
name: react-useRef
description: Persist mutable values across renders without triggering re-renders, and access DOM nodes imperatively.
tech_stack: [react]
language: [javascript, typescript]
capability: [state-management]
version: "React unversioned (react.dev)"
collected_at: 2025-01-01
---

# useRef

> Source: https://react.dev/reference/react/useRef

## Purpose

`useRef` creates a mutable object that persists across re-renders. Changing its `.current` property does **not** trigger a re-render, making it ideal for values that need to survive renders but don't affect the UI.

## When to Use

- **Storing mutable values** that must persist between renders: interval IDs, timer handles, previous values, counters read only in event handlers.
- **Accessing DOM nodes** imperatively: focus, scroll, measure, play/pause media, text selection.
- **Avoiding expensive re-creation** of objects (e.g., `new VideoPlayer()`) on every render by using the ref as a stable container.
- **NOT for values that should appear on screen** — use `useState` for those.

## Basic Usage

### Mutable value that persists across renders

```js
import { useRef } from 'react';

function Stopwatch() {
  const intervalRef = useRef(0);

  function handleStart() {
    intervalRef.current = setInterval(() => { /* tick */ }, 1000);
  }

  function handleStop() {
    clearInterval(intervalRef.current);
  }
  // ...
}
```

### DOM node access

```jsx
import { useRef } from 'react';

function Form() {
  const inputRef = useRef(null);

  function handleClick() {
    inputRef.current.focus(); // imperative DOM access
  }

  return (
    <>
      <input ref={inputRef} />
      <button onClick={handleClick}>Focus</button>
    </>
  );
}
```

### Lazy initialization of expensive objects

```js
function Video() {
  const playerRef = useRef(null);

  if (playerRef.current === null) {
    playerRef.current = new VideoPlayer(); // only runs once
  }
  // ...
}
```

Reading/writing `ref.current` during render is normally forbidden, but this pattern is safe because the condition only runs during initialization and the result is always predictable.

## Key APIs (Summary)

| Aspect | Detail |
|--------|--------|
| Signature | `const ref = useRef(initialValue)` |
| Returns | `{ current: initialValue }` — the **same object** across all renders |
| Parameter | `initialValue`: any type; ignored after the initial render |
| Mutation | `ref.current = x` — allowed in event handlers & effects |
| Re-render | Changing `.current` does **not** trigger a re-render |

## Caveats

- **Never read or write `ref.current` during the render body** (except for lazy initialization). Use event handlers or `useEffect` instead.
- **Custom components don't forward refs by default.** Pass `ref` as a prop or use `forwardRef`:
  ```jsx
  const MyInput = forwardRef((props, ref) => (
    <input {...props} ref={ref} />
  ));
  ```
- **`useRef` vs `useState`:** ref changes don't cause re-renders; state changes do. Use refs for values you need to persist without UI impact.
- **Strict Mode double-invocation:** In development, the component function runs twice, creating two ref objects (one discarded). This is harmless for pure components.

## Composition Hints

- **Combine with `useEffect`** to react to prop/state changes and store results in a ref:
  ```js
  const prevValue = useRef(value);
  useEffect(() => { prevValue.current = value; }, [value]);
  ```

- **Expose refs from custom components** via `forwardRef` or by accepting `ref` as a named prop for child built-in elements.

- **Use refs as escape hatches** — prefer declarative React patterns first; reach for refs only when you need imperative DOM access or mutable values that must not trigger re-renders.
