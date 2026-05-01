---
name: react-useMemo-useCallback
description: Memoize expensive calculations and cache function references to prevent unnecessary re-renders in React.
tech_stack: [react]
language: [javascript, typescript]
capability: [state-management]
version: "React unversioned (react.dev)"
collected_at: 2025-01-01
---

# useMemo & useCallback

> Sources: https://react.dev/reference/react/useMemo · https://react.dev/reference/react/useCallback

## Purpose

Both hooks are **performance optimization** tools that cache (memoize) values across re-renders. The difference is in *what* they cache:

| Hook | Caches | Calls the function? |
|------|--------|---------------------|
| `useMemo` | The **result** of calling a calculation function | Yes — calls it during render, caches the return value |
| `useCallback` | The **function itself** | No — returns the function unchanged so its reference stays stable |

`useCallback` is syntactic sugar: `useCallback(fn, deps)` ≈ `useMemo(() => fn, deps)`.

## When to Use

Memoization is **only valuable** in these specific scenarios (otherwise skip it):

1. **Expensive calculation** whose dependencies rarely change — skip recomputation with `useMemo`.
2. **Passing to a `memo`-wrapped child** — stable references let `memo` skip re-rendering. Use `useMemo` for objects/arrays, `useCallback` for functions.
3. **Stabilizing a dependency of another Hook** (e.g., `useEffect`, another `useMemo`/`useCallback`).

**Do not memoize everything blindly** — it adds complexity for no benefit in most cases. Fix performance problems first, then add memoization where profiling shows it helps.

## Basic Usage

### useMemo — cache a calculation result

```js
import { useMemo } from 'react';

function TodoList({ todos, tab }) {
  const visibleTodos = useMemo(
    () => filterTodos(todos, tab),  // expensive calculation
    [todos, tab]                      // only re-run when these change
  );

  return <List items={visibleTodos} />;
}
```

Without `useMemo`, `filterTodos` runs on every render. With it, the result is reused until `todos` or `tab` changes (compared via `Object.is`).

### useCallback — cache a function reference

```js
import { useCallback } from 'react';

function ProductPage({ productId, referrer }) {
  const handleSubmit = useCallback(
    (orderDetails) => {
      post(`/product/${productId}/buy`, { referrer, orderDetails });
    },
    [productId, referrer]  // only create a new function when these change
  );

  return <ShippingForm onSubmit={handleSubmit} />; // ShippingForm wrapped in memo
}
```

In JavaScript, `() => {}` creates a **new function** every time it's evaluated. Without `useCallback`, `memo(ShippingForm)` would re-render on every parent render because `onSubmit` is always a new reference.

## Key APIs (Summary)

### useMemo

```js
const cachedValue = useMemo(calculateValue, dependencies)
```

- `calculateValue`: pure function, no arguments, returns the value to cache
- `dependencies`: array of reactive values; compared with `Object.is`
- Returns: cached result (recalculated only when deps change)

### useCallback

```js
const cachedFn = useCallback(fn, dependencies)
```

- `fn`: the function to cache; takes any args, returns any values
- `dependencies`: array of reactive values referenced inside `fn`
- Returns: the `fn` itself (same reference until deps change)

## Caveats

### Shared caveats

- **Only call at top level** of a component or custom Hook — never inside loops/conditions.
- **Use only as a performance optimization**, not a semantic guarantee. React may discard the cache (e.g., in development on file edit, or on initial-mount suspense). If you need guaranteed stability, use `useRef` or state.
- **Dependency arrays must be complete.** The React linter (`eslint-plugin-react-hooks`) catches missing deps. An incomplete array causes stale closures.
- **Forgetting the dependency array** (`useCallback(fn)` without `[]`) returns a new value every render — identical to not using the hook at all.

### useMemo-specific

- **Strict Mode calls `calculateValue` twice** in development to detect impurities. One result is discarded. This is harmless for pure functions.
- **The first render is never faster** — memoization only helps on subsequent renders.

### useCallback-specific

- **The function is still created on every render.** React simply ignores the new one and returns the cached version when deps match. This is normal and acceptable.

### When NOT to use

Memoization is unnecessary and adds complexity when:
- The calculation is trivially fast (most are).
- The value isn't passed to a `memo`-wrapped child.
- The value isn't a dependency of another Hook.

## Composition Hints

### Reduce dependencies with updater functions

When a memoized callback needs state only to compute the next value, use the **updater form** of `setState` to eliminate the state dependency:

```js
// ❌ todos is a dependency — callback changes every time todos changes
const handleAddTodo = useCallback((text) => {
  setTodos([...todos, { id: nextId++, text }]);
}, [todos]);

// ✅ No dependency on todos — callback is stable forever
const handleAddTodo = useCallback((text) => {
  setTodos(todos => [...todos, { id: nextId++, text }]);
}, []);
```

### Move dependencies inside Effects instead of memoizing

Often the best fix is structural — eliminate the dependency rather than stabilize it:

```js
// ❌ Requires useMemo to keep options stable
const options = useMemo(() => ({ serverUrl, roomId }), [roomId]);
useEffect(() => { createConnection(options); }, [options]);

// ✅ Simpler — move the object inside the Effect
useEffect(() => {
  const options = { serverUrl, roomId };
  const conn = createConnection(options);
  return () => conn.disconnect();
}, [roomId]);
```

### Stabilize returned functions in custom Hooks

Wrap functions returned from custom Hooks with `useCallback` so consumers can memoize their own code:

```js
function useRouter() {
  const { dispatch } = useContext(RouterStateContext);

  const navigate = useCallback((url) => {
    dispatch({ type: 'navigate', url });
  }, [dispatch]);

  return { navigate };
}
```

### Architectural patterns that reduce memoization needs

- **Pass JSX as children** — when a wrapper updates its own state, children don't re-render.
- **Keep state local** — don't lift it higher than necessary.
- **Keep rendering logic pure** — if re-rendering causes visual bugs, fix the bug, don't memoize.
- **Avoid unnecessary Effects** — chains of `setState` inside Effects are the most common performance killer.
