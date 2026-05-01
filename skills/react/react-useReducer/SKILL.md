---
name: react-useReducer
description: Manage complex component state with a reducer function and dispatch pattern — ideal when next state depends on previous state or involves multiple sub-values
tech_stack: [react]
language: [javascript, typescript]
capability: [state-management, ui-form]
version: "React 19"
collected_at: 2025-01-01
---

# useReducer

> Source: https://react.dev/reference/react/useReducer

## Purpose

`useReducer` centralizes state update logic into a single **reducer function** outside the component. Instead of scattering `setState` calls across event handlers, you define state transitions by dispatching actions through a pure reducer.

## When to Use

- State shape is complex (multiple sub-values, arrays, nested objects)
- Next state depends on the previous state in non-trivial ways
- Multiple state updates need to happen together as one atomic transition
- You want testable state logic decoupled from the component

**useReducer vs useState:** prefer `useReducer` when the update logic is the complexity, not just the data shape. If you find yourself writing `setState(prev => ...)` with involved logic in multiple handlers, extract a reducer.

## Basic Usage

```js
import { useReducer } from 'react';

// Pure reducer: (state, action) => nextState
function reducer(state, action) {
  switch (action.type) {
    case 'incremented_age':
      return { ...state, age: state.age + 1 };
    case 'changed_name':
      return { ...state, name: action.nextName };
    default:
      throw Error('Unknown action: ' + action.type);
  }
}

function Form() {
  const [state, dispatch] = useReducer(reducer, { name: 'Taylor', age: 42 });

  return (
    <>
      <input
        value={state.name}
        onChange={e => dispatch({ type: 'changed_name', nextName: e.target.value })}
      />
      <button onClick={() => dispatch({ type: 'incremented_age' })}>
        Increment age
      </button>
      <p>Hello, {state.name}. You are {state.age}.</p>
    </>
  );
}
```

### Lazy initialization (avoid recreating expensive initial state)

Pass the **initializer function itself** as the third argument — it only runs once:

```js
// 🚩 createInitialState(username) runs on every render
const [state, dispatch] = useReducer(reducer, createInitialState(username));

// ✅ createInitialState only runs during initialization
const [state, dispatch] = useReducer(reducer, username, createInitialState);
```

If no argument is needed: `useReducer(reducer, null, createInitialState)`.

### Immer integration pattern

For deeply nested state, `useImmerReducer` lets you write mutating-style reducers:

```js
import { useImmerReducer } from 'use-immer';

function reducer(draft, action) {
  switch (action.type) {
    case 'incremented_age':
      draft.age += 1;
      break;
    case 'changed_name':
      draft.name = action.nextName;
      break;
  }
}
```

## Key APIs (Summary)

| Signature | Notes |
|---|---|
| `useReducer(reducer, initialArg, init?)` | `init(initialArg)` produces initial state; omitting `init` uses `initialArg` directly |
| `dispatch(action)` | Stable identity; action usually `{ type, ...payload }` |

**dispatch behavior:**
- State updates are **batched** — React updates the screen after all handlers finish
- `dispatch` only changes state for the **next** render; reading `state` after `dispatch` still gives the old value (snapshot semantics)
- If next state is `Object.is` equal to current, React **skips the re-render**
- `dispatch` has a stable identity — safe to omit from Effect deps

## Caveats

1. **State must be treated as immutable.** Mutating and returning the same object causes React to skip the re-render. Always return a new object/array.

2. **Stale state after dispatch.** `dispatch` queues a re-render but doesn't change `state` in the current execution:
   ```js
   dispatch({ type: 'incremented_age' });
   console.log(state.age); // still the old value
   ```
   If you need the next value immediately, compute it manually: `reducer(state, action)`.

3. **"Too many re-renders"** — means you're dispatching during render (e.g., `onClick={handleClick()}` instead of `onClick={handleClick}`).

4. **Undefined state after dispatch** — either a `case` branch forgot `...state` spread (losing other fields), or an unhandled action type fell through without a return.

5. **Strict Mode double invocation** — React calls your reducer/initializer twice in development to detect impurities. This is harmless if your reducer is pure, but will surface accidental mutations (e.g., you'll see a todo added twice).

6. **Don't call `useReducer` in loops/conditions.** Hooks must be top-level.

## Composition Hints

- **Reducer + Context:** Lift `useReducer` into a Context Provider to share dispatch across a subtree — classic "flux-like" pattern without external libraries.
- **Extract the reducer as a module-level function** for unit testing without mounting components.
- **Combine with `useEffect`** when side effects must follow state transitions — but prefer deriving data in the reducer itself when possible.
- **For form-heavy UIs**, consider whether a form library (`react-hook-form`, `formik`) would reduce boilerplate more than a hand-written reducer.
