---
name: react-custom-hooks
description: Create reusable custom React Hooks to extract and share stateful logic between components.
tech_stack: [react]
language: [javascript, typescript]
capability: [state-management]
version: "React unversioned"
collected_at: 2025-01-01
---

# React Custom Hooks

> Source: https://react.dev/reference/react/hooks, https://react.dev/learn/reusing-logic-with-custom-hooks

## Purpose

Custom Hooks are JavaScript functions that start with `use` and can call other React Hooks. They let you extract stateful logic from components into reusable functions, hiding implementation details so component code expresses *intent* rather than *how*.

Each call to a custom Hook is fully independent — custom Hooks share **stateful logic**, not state itself. If you need shared state across components, lift state up and pass it down.

## When to Use

- **Repeated patterns:** The same state + Effect + event-handler combo appears in multiple components (e.g., form fields, online status, window size)
- **Hiding complexity:** You want to encapsulate gnarly browser API or external-system interactions behind a clean interface
- **Intent-driven components:** Component code should read like "what it does" rather than "how it works"
- **Composable behavior:** You need to chain Hooks together — the output of one Hook feeds into another

Do NOT extract a custom Hook for every bit of duplicated code — only when the abstraction clarifies intent.

## Basic Usage

```javascript
// 1. Write a function starting with "use" that calls other Hooks
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    function handleOnline()  { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// 2. Use it in any component — each call gets its own independent state
function StatusBar() {
  const isOnline = useOnlineStatus();
  return <h1>{isOnline ? '✅ Online' : '❌ Disconnected'}</h1>;
}

function SaveButton() {
  const isOnline = useOnlineStatus();
  return (
    <button disabled={!isOnline} onClick={() => console.log('Saved')}>
      {isOnline ? 'Save progress' : 'Reconnecting...'}
    </button>
  );
}
```

## Key APIs (Summary)

Custom Hooks are built from standard React Hooks. The most commonly composed:

| Category | Hooks |
|---|---|
| **State** | `useState`, `useReducer` |
| **Context** | `useContext` |
| **Effects** | `useEffect`, `useLayoutEffect`, `useEffectEvent` |
| **Refs** | `useRef`, `useImperativeHandle` |
| **Performance** | `useMemo`, `useCallback`, `useTransition`, `useDeferredValue` |
| **Other** | `useDebugValue` (DevTools label), `useId`, `useSyncExternalStore` |

**Naming rule:** Hook names MUST start with `use` + capital letter. Functions that don't call Hooks should NOT use the `use` prefix — write them as regular functions instead.

## Caveats

- **No shared state:** Two components calling `useOnlineStatus()` each get their own `isOnline`. To share state, lift it into a common ancestor and pass via props or context.
- **Must be pure:** Custom Hooks re-run on every render, just like the component body. No side effects except inside `useEffect`/`useLayoutEffect`.
- **Event handlers in Effect deps cause churn:** If a custom Hook accepts a callback used inside `useEffect`, wrap it with `useEffectEvent` so the Effect doesn't re-synchronize on every render.
- **Effects are an escape hatch:** Don't build custom Hooks that orchestrate data flow via Effects. If you're not interacting with an external system (browser API, network, third-party library), you probably don't need an Effect — and therefore may not need that custom Hook.
- **Always declare Effect dependencies:** Every reactive value read inside `useEffect`/`useMemo`/`useCallback` must appear in the dependency array.

## Composition Hints

**Passing reactive values between Hooks** — Hooks re-run with the latest props/state on every render, so chaining works naturally:

```javascript
function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234');
  useChatRoom({ roomId, serverUrl }); // receives fresh values on every render
  // ...
}
```

**Accepting event handlers** — use `useEffectEvent` so the Effect doesn't re-run when the handler reference changes:

```javascript
function useChatRoom({ serverUrl, roomId, onReceiveMessage }) {
  const onMessage = useEffectEvent(onReceiveMessage); // stable reference

  useEffect(() => {
    const connection = createConnection({ serverUrl, roomId });
    connection.connect();
    connection.on('message', (msg) => onMessage(msg));
    return () => connection.disconnect();
  }, [roomId, serverUrl]); // onReceiveMessage intentionally omitted
}
```

**Returning object spreads for form inputs** — a common idiom:

```javascript
function useFormInput(initialValue) {
  const [value, setValue] = useState(initialValue);
  return {
    value,
    onChange: (e) => setValue(e.target.value)
  };
}
// Usage: <input {...firstNameProps} />
```

**Splitting context + reducer via Hooks** — pair `useContext` and `useReducer`:

```javascript
function useTasks()      { return useContext(TasksContext); }
function useTasksDispatch() { return useContext(TasksDispatchContext); }
```

**DevTools labeling** — use `useDebugValue` inside your custom Hook to show a meaningful label in React DevTools:

```javascript
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  useDebugValue(isOnline ? 'Online' : 'Offline');
  // ...
}
```
