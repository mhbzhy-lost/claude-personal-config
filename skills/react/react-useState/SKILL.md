---
name: react-useState
description: React useState Hook — declare state variables in function components with lazy initializers, updater functions, and immutable update patterns.
tech_stack: [react]
language: [javascript, typescript]
capability: [state-management]
version: "React 18/19"
collected_at: 2025-01-01
---

# useState

> Source: https://react.dev/reference/react/useState

## Purpose

`useState` adds local state to function components. It returns a state value and a setter function that triggers re-render. React 18+ automatically batches multiple state updates within event handlers into a single re-render.

## When to Use

- Any value that changes over time and drives rendering (form inputs, toggles, counters, UI state)
- Values that can't be computed from props or other state — prefer derived values in render if possible
- Use **lazy initializer** (`useState(fn)`) when the initial value is expensive to compute
- Use **updater function** (`setState(prev => next)`) when the new state depends on the previous value, especially for batched updates
- Prefer `useReducer` when state logic is complex, involves multiple sub-values, or when next state depends on multiple previous state fields

## Basic Usage

```jsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      {count}
    </button>
  );
}
```

**Lazy initializer** (function form — runs only once):

```jsx
// ✅ Function passed — called only on first render
const [todos, setTodos] = useState(createInitialTodos);

// 🚩 Call result — recomputed every render (wasted work)
const [todos, setTodos] = useState(createInitialTodos());
```

**Updater function** (when new state depends on previous):

```jsx
// 🚩 Three calls in same handler, but only increments once
setCount(count + 1); setCount(count + 1); setCount(count + 1);

// ✅ Updater queued — all three applied to pending state
setCount(c => c + 1); setCount(c => c + 1); setCount(c => c + 1);
```

**Immutable update for objects/arrays:**

```jsx
// 🚩 Mutation — React skips re-render (same Object.is reference)
form.name = 'Taylor'; setForm(form);

// ✅ Replace with new object
setForm({ ...form, name: 'Taylor' });

// ✅ Array: add, remove, update immutably
setItems([...items, newItem]);
setItems(items.filter(i => i.id !== targetId));
setItems(items.map(i => i.id === id ? { ...i, done: true } : i));
```

**Resetting component state with `key`:**

```jsx
function App() {
  const [version, setVersion] = useState(0);
  return (
    <>
      <button onClick={() => setVersion(v => v + 1)}>Reset</button>
      <Form key={version} />
    </>
  );
}
```

## Key APIs (Summary)

| Signature | Purpose |
|-----------|---------|
| `useState(initialValue)` | Declare state with any value type |
| `useState(initFn)` | Lazy initializer — function called once |
| `setState(nextValue)` | Set next state directly |
| `setState(prev => next)` | Updater function — queues against pending state |
| `flushSync(() => setState(...))` | Force synchronous React update (rare — DOM access) |

**`setState` behavior:**
- Stable reference — safe to omit from Effect dependency arrays
- Returns `undefined`
- Calling during render is allowed only inside a condition guard (for "previous render" patterns) — otherwise causes infinite loops
- In Strict Mode (dev only), initializer and updater functions are called twice to detect impurities

## Caveats

- **State is a snapshot** — reading state right after `setState` returns the *old* value. The new value is visible only in the next render.

```jsx
setName('Robin');
console.log(name); // Still the old value!
```

- **Object.is bailout** — if `Object.is(prev, next)` is `true`, React skips the re-render. This is why mutation silently fails — the reference hasn't changed.

- **Auto-batching** (React 18+) — multiple `setState` calls in the same event handler are batched into one render. In React 17 and earlier, only React event handlers were batched; now timeouts, promises, and native events are also batched.

- **Storing a function in state** — you can't do `setState(myFunction)` because React treats the function as an *updater*. Wrap it: `setState(() => myFunction)`.

- **No conditional calls** — `useState` must be called unconditionally at the top level of a component or custom Hook. Never inside loops, conditions, or after early returns.

- **"Too many re-renders"** — usually caused by calling `setState` unconditionally during render, creating an infinite loop.

## Composition Hints

- **With useEffect**: use `useState` for data that drives rendering; use `useEffect` to synchronize external systems based on that state.

- **With useRef**: use `useRef` for mutable values that shouldn't trigger re-render (timers, DOM handles, previous-value tracking).

- **With useReducer**: if a single `setState` call needs to update multiple related values, or the update logic has many branches, extract to `useReducer`.

- **Custom Hooks**: wrap `useState` + related logic in a custom Hook with a `use`-prefixed name for reuse (e.g., `useFormInput`, `useToggle`).

- **With Context**: lifting state into Context makes it global — but note that *all* consumers re-render on every change. Split Contexts or memoize to limit re-renders.
