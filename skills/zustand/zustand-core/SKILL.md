---
name: zustand-core
description: Lightweight React state management using hooks — no providers, no boilerplate, supports vanilla JS/TS
tech_stack: [react]
language: [typescript, javascript]
capability: [state-management, local-storage]
version: "zustand v5"
collected_at: 2025-07-15
---

# Zustand Core

> Source: https://github.com/pmndrs/zustand, https://zustand.docs.pmnd.rs/

## Purpose

Zustand is a small, fast, hook-based state management library for React (and vanilla JS/TS) using simplified Flux principles. It requires **no context providers**, handles React concurrency correctly, and avoids the zombie-child and context-loss problems that plague other state managers.

## When to Use

- Replacing Redux or React Context for shared/global state
- Reading/writing state **outside** React components (e.g. in event handlers, intervals, vanilla code)
- Transient updates: subscribing to state changes **without triggering re-renders** (high-frequency updates like mouse position, animations)
- Persisting state across page reloads (built-in `persist` middleware)
- Debugging state with Redux DevTools, without using Redux
- State that must work in both React and vanilla JS environments

## Basic Usage

### Create a store (hook)

```ts
import { create } from 'zustand'

interface BearState {
  bears: number
  increase: (by: number) => void
  removeAll: () => void
}

const useBearStore = create<BearState>()((set, get) => ({
  bears: 0,
  increase: (by) => set((state) => ({ bears: state.bears + by })),
  removeAll: () => set({ bears: 0 }),
}))
```

### Use in components — no Provider needed

```tsx
function BearCounter() {
  const bears = useBearStore((state) => state.bears) // selector
  return <h1>{bears} bears</h1>
}

function Controls() {
  const increase = useBearStore((state) => state.increase)
  return <button onClick={() => increase(1)}>+1</button>
}
```

**Critical:** Always use selectors. `const state = useBearStore()` re-renders on **every** state change.

## Key APIs (Summary)

### `set` — update state

| Signature | Behavior |
|---|---|
| `set({ key: val })` | Shallow-merge partial state |
| `set({ key: val }, true)` | **Replace** entire state (wipes actions!) |
| `set(state => ...)` | Functional updater |
| `set(partial, undefined, 'actionName')` | DevTools action label |

### `get` — read state inside actions (non-reactive)

```ts
create((set, get) => ({
  sound: 'grunt',
  action: () => { const s = get().sound; /* ... */ }
}))
```

### Store API (on the hook itself — outside React)

```ts
useDogStore.getState()          // fresh snapshot, no subscription
useDogStore.setState({ paw: false })  // update + notify subscribers
useDogStore.subscribe(listener)       // returns unsubscribe fn
```

**Warning:** Middlewares that wrap `set`/`get` do **not** affect `getState`/`setState`.

### `useShallow` — select multiple slices

Prevents re-renders when the combined object reference changes but values are shallow-equal:

```ts
import { useShallow } from 'zustand/react/shallow'

const { nuts, honey } = useBearStore(
  useShallow((state) => ({ nuts: state.nuts, honey: state.honey }))
)
```

### Async actions — just call `set` when ready

```ts
create((set) => ({
  fish: {},
  fetch: async (pond: string) => {
    const res = await fetch(pond)
    set({ fish: await res.json() })
  },
}))
```

### Vanilla store (no React)

```ts
import { createStore } from 'zustand/vanilla'

const store = createStore((set) => ({ count: 0, inc: () => set(s => ({ count: s.count + 1 })) }))
const { getState, setState, subscribe } = store

// Bridge to React when needed:
import { useStore } from 'zustand'
const useBoundStore = (sel) => useStore(store, sel)
```

### Transient updates — subscribe without re-render

```tsx
const Component = () => {
  const ref = useRef(useStore.getState().position)
  useEffect(() =>
    useStore.subscribe((s) => { ref.current = s.position }),
    []
  )
  // Use ref.current directly (mutate DOM, canvas, etc.)
}
```

### subscribeWithSelector middleware

```ts
import { subscribeWithSelector } from 'zustand/middleware'

const useStore = create(subscribeWithSelector(() => ({ a: 1, b: 2 })))

// Subscribe to specific field changes, with previous value
useStore.subscribe(s => s.a, (a, prevA) => console.log(a, prevA), {
  equalityFn: shallow,
  fireImmediately: true,   // call immediately with current value
})
```

### Middleware: devtools

```ts
import { devtools } from 'zustand/middleware'
// Requires: npm install @redux-devtools/extension

const useStore = create<State>()(
  devtools(
    (set) => ({
      count: 0,
      inc: () => set(s => ({ count: s.count + 1 }), undefined, 'count/inc'),
      //                                           action type for DevTools ^
    }),
    {
      name: 'MyStore',           // DevTools instance name
      enabled: process.env.NODE_ENV !== 'production',
      actionsDenylist: ['internal/.*'],  // hide sensitive actions
    }
  )
)

// Cleanup when store is destroyed:
useStore.devtools.cleanup()
```

### Middleware: persist

```ts
import { persist, createJSONStorage } from 'zustand/middleware'

const useStore = create<State>()(
  persist(
    (set) => ({ count: 0, inc: () => set(s => ({ count: s.count + 1 })) }),
    {
      name: 'my-storage-key',       // REQUIRED, unique localStorage key
      storage: createJSONStorage(() => sessionStorage),  // default: localStorage
      partialize: (state) => ({ count: state.count }),   // only persist some fields
      version: 1,
      migrate: (persisted, version) => {
        if (version === 0) { /* transform old shape */ }
        return persisted
      },
      merge: (persisted, current) => ({ ...current, ...persisted }),  // default: shallow
      skipHydration: true,  // for SSR: rehydrate manually with store.persist.rehydrate()
    }
  )
)
```

### Middleware: immer

```ts
import { immer } from 'zustand/middleware/immer'
// Requires: npm install immer

const useStore = create<State>()(
  immer((set) => ({
    nested: { deep: { value: 1 } },
    update: () => set((state) => { state.nested.deep.value += 1 })  // mutate directly!
  }))
)
```

### Middleware composition

```ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

const useStore = create<State>()(
  devtools(
    persist(
      immer((set) => ({ /* ... */ })),
      { name: 'my-store' }
    ),
    { name: 'MyStore' }
  )
)
```

### Slices pattern (TypeScript)

```ts
import { create, StateCreator } from 'zustand'

type BearSlice = { bears: number; addBear: () => void }
type FishSlice = { fishes: number; addFish: () => void }

const createBearSlice: StateCreator<BearSlice & FishSlice, [], [], BearSlice> = (set) => ({
  bears: 0,
  addBear: () => set((s) => ({ bears: s.bears + 1 })),
})

const createFishSlice: StateCreator<BearSlice & FishSlice, [], [], FishSlice> = (set) => ({
  fishes: 0,
  addFish: () => set((s) => ({ fishes: s.fishes + 1 })),
})

const useStore = create<BearSlice & FishSlice>()((...args) => ({
  ...createBearSlice(...args),
  ...createFishSlice(...args),
}))
```

### React Context integration (dependency injection)

```tsx
import { createContext, useContext } from 'react'
import { createStore, useStore } from 'zustand'

const StoreContext = createContext(createStore(/* ... */))

const App = ({ children }) => (
  <StoreContext.Provider value={createStore(/* ... */)}>
    {children}
  </StoreContext.Provider>
)

const Component = () => {
  const store = useContext(StoreContext)
  const value = useStore(store, (s) => s.value)
}
```

## Caveats

- **Always use selectors**: `useStore(s => s.field)`. Selecting the whole state re-renders on every change.
- **`set({}, true)` wipes actions**: The replace-mode (`true` as 2nd arg) clears everything, including functions. Prefer merge mode unless you explicitly want a reset.
- **No RSC support**: `getState()` and `subscribe()` are not safe in React Server Components (Next.js 13+). Use only in client components.
- **Middleware doesn't wrap `getState`/`setState`**: Vanilla API methods bypass middleware wrapping. Use the hook or `store.setState` from the hook, not from `createStore`.
- **Persist default merge is shallow**: Nested objects may lose fields during rehydration. Provide a custom `merge` function for deep merging.
- **DevTools default action name is "anonymous"**: Always pass the 3rd argument to `set` for meaningful DevTools entries.
- **Immer requires separate install**: `npm install immer` is needed for `zustand/middleware/immer`.
- **`@redux-devtools/extension` required separately** for devtools middleware.

## Composition Hints

- Compose middleware from **inside out**: `devtools(persist(immer(...)))` — the innermost middleware runs first.
- **Slices pattern** is the recommended way to split large stores: each slice is a `StateCreator` that receives `(set, get, store)` and returns a partial state object. Spread them together in `create`.
- For SSR: use `persist` with `skipHydration: true`, then call `await store.persist.rehydrate()` after mounting on the client.
- Use `subscribeWithSelector` when you need fine-grained external subscriptions (not inside components — use `useShallow` there).
- For dynamic stores (per-component state with context), use `createStore` (vanilla) + React Context + `useStore` hook — not the hook-returning `create`.
- When migrating persisted state, bump `version` and provide `migrate`; the stored version integer must match or migration runs.
