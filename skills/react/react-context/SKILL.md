---
name: react-context
description: Pass data deeply through the React component tree without prop drilling using Context.
tech_stack: [react]
language: [javascript, typescript]
capability: [state-management]
version: "React unversioned (19+ for provider shorthand)"
collected_at: 2025-01-01
---

# React Context

> Source: https://react.dev/reference/react/createContext, https://react.dev/reference/react/useContext

## Purpose

Context lets components pass information deep down the component tree without threading props through every intermediate level. It's React's built-in mechanism for dependency injection — any component inside a provider can read the value, no matter how deeply nested.

**The three-part pattern:** `createContext` (define) → `<Context value={...}>` (provide) → `useContext` (consume).

## When to Use

- **Theming:** dark/light mode, design tokens, color schemes
- **Authentication:** current user, login state, permissions
- **Localization/i18n:** current locale, translation functions
- **Feature flags / A/B tests:** toggles that affect many components
- **Any "global" subtree data** where prop drilling becomes noisy

Context is NOT a universal replacement for props. If only 2-3 components need the data, props are simpler and make data flow explicit. Overusing context makes components harder to reuse in isolation.

## Basic Usage

```javascript
// 1. Create context (typically in a separate file)
import { createContext } from 'react';
export const ThemeContext = createContext('light'); // default value

// 2. Provide a value (wrap a subtree)
import { ThemeContext } from './Contexts';

function App() {
  const [theme, setTheme] = useState('dark');
  return (
    <ThemeContext value={theme}>
      <Page />
    </ThemeContext>
  );
}

// 3. Consume the value (anywhere inside the provider)
import { useContext } from 'react';
import { ThemeContext } from './Contexts';

function Button({ children }) {
  const theme = useContext(ThemeContext);
  return <button className={`btn-${theme}`}>{children}</button>;
}
```

## Key APIs (Summary)

| API | Role | Signature |
|---|---|---|
| `createContext(defaultValue)` | Define a context | Returns a context object |
| `<Context value={...}>` | Provide a value to subtree | React 19+ shorthand; use `<Context.Provider>` in older versions |
| `useContext(Context)` | Read the nearest provider value | Returns current value; re-renders on change |
| `<Context.Consumer>` | Legacy render-prop reader | Prefer `useContext` in new code |

**React 19+:** Render `<ThemeContext value={theme}>` directly. In React 18 and earlier, use `<ThemeContext.Provider value={theme}>`.

## Caveats

- **Default value is static.** `createContext('light')` is a fallback that never changes on its own. To make context dynamic, pair it with component state and a provider.
- **Provider MUST be above the consumer.** `useContext()` searches upward and ignores providers in the same component. If a component both provides and tries to read the same context, it won't see its own provider.
- **`React.memo` does NOT block context re-renders.** When a provider's `value` changes (detected via `Object.is`), all descendant consumers re-render regardless of memoization.
- **Missing `value` prop → `undefined`.** Rendering `<ThemeContext>` without `value` is equivalent to `value={undefined}`, which overrides the default value from `createContext`. Always write `value={...}` explicitly.
- **Object/function identity triggers re-renders.** Passing `value={{ user, login }}` creates a new object every render, causing all consumers to re-render. Stabilize with `useMemo` + `useCallback`:

```javascript
const contextValue = useMemo(() => ({ currentUser, login }), [currentUser, login]);
```

- **Module duplication breaks context.** Context identity is `===`-based. If build tooling (symlinks, duplicated bundles) creates two copies of the same context module, providers and consumers won't match. Debug by checking `window.SomeContext1 === window.SomeContext2`.
- **`.Consumer` and `.Provider` are legacy.** Use `useContext()` and the React 19+ `<Context>` shorthand in new code.

## Composition Hints

**Splitting state and dispatch** — for complex state with `useReducer`, separate data and dispatch into two contexts to avoid unnecessary re-renders in components that only dispatch:

```javascript
const TasksContext = createContext(null);
const TasksDispatchContext = createContext(null);

function TasksProvider({ children }) {
  const [tasks, dispatch] = useReducer(tasksReducer, initialTasks);
  return (
    <TasksContext value={tasks}>
      <TasksDispatchContext value={dispatch}>
        {children}
      </TasksDispatchContext>
    </TasksContext>
  );
}

// Component that only dispatches won't re-render when tasks change
function AddTaskButton() {
  const dispatch = useContext(TasksDispatchContext);
  // ...
}
```

**Overriding context for a subtree** — nest providers to give a branch different values:

```javascript
<ThemeContext value="dark">
  <Header />           {/* "dark" */}
  <ThemeContext value="light">
    <Sidebar />        {/* "light" */}
  </ThemeContext>
  <Footer />           {/* "dark" */}
</ThemeContext>
```

**Extracting a provider component** — for clean consumer-facing hooks:

```javascript
// AuthContext.js
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const login = useCallback(/* ... */, []);
  const value = useMemo(() => ({ user, login }), [user, login]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
```
