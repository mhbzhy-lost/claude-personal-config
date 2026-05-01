---
name: vue3-pinia
description: Pinia state management for Vue 3 — defineStore with Option and Setup stores, getters caching, storeToRefs, $patch, plugins, SSR hydration safety, and Vuex migration notes.
tech_stack: [vue3]
language: [typescript, javascript]
capability: [state-management]
version: "Pinia 2.x"
collected_at: 2025-01-21
---

# Pinia State Management

> Source: https://pinia.vuejs.org/introduction.html, https://pinia.vuejs.org/core-concepts/, https://pinia.vuejs.org/ssr/, https://pinia.vuejs.org/cookbook/

## Purpose

Pinia is the recommended state management library for Vue. It provides shared reactive state across components/pages with full TypeScript inference, devtools integration (timeline, time-travel debugging), HMR, plugin system, and SSR safety. It replaces Vuex with a simpler, flat API that eliminates mutations and namespaced modules.

## When to Use

- **Shared state** across distant components (replaces prop drilling and event buses)
- **SSR applications** — raw `export const state = reactive({})` causes cross-request state pollution; Pinia creates a fresh store per request
- **TypeScript codebases** — first-class type inference with zero manual typing
- **Teams needing devtools** visibility into state changes and time-travel debugging
- **Migrating from Vuex** — simpler API, no mutations, no module nesting, no magic strings

## Basic Usage

### Define a store

Every store needs a **unique id** (first argument). Convention: name the composable `use...Store`:

```js
// stores/counter.js
import { defineStore } from 'pinia'

// Option Store style
export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
  getters: {
    doubleCount: (state) => state.count * 2,
  },
  actions: {
    increment() { this.count++ },
  },
})

// Setup Store style (function syntax)
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const doubleCount = computed(() => count.value * 2)
  function increment() { count.value++ }
  return { count, doubleCount, increment }
})
```

### Use the store

```vue
<script setup>
import { useCounterStore } from '@/stores/counter'
const counter = useCounterStore()

// Mutate state
counter.count++                       // direct
counter.$patch({ count: counter.count + 1 })  // batch object
counter.$patch((state) => { state.count++ })  // batch function
counter.increment()                   // via action (preferred for complex logic)
</script>

<template>
  <div>Count: {{ counter.count }}</div>
  <div>Double: {{ counter.doubleCount }}</div>
</template>
```

The store is created **lazily** — only on first `useCounterStore()` call. The returned object is wrapped with `reactive`, so getters need no `.value`.

## Key APIs

### storeToRefs — Reactive Destructuring

Direct destructuring **breaks reactivity**. Use `storeToRefs()` for state/getters; actions can be destructured directly:

```js
import { storeToRefs } from 'pinia'
const store = useCounterStore()

const { count, doubleCount } = storeToRefs(store) // ✅ reactive refs
const { increment } = store                        // ✅ actions are safe
```

### $patch — Batch Updates

```js
store.$patch({ name: 'New', count: store.count + 1 })
store.$patch((state) => { state.items.push({ name: 'shoes' }) })
```

### $reset — Reset State (Option Stores only)

Resets to initial state. Setup Stores must implement their own `$reset` method.

### Getters — Cached Computed

Getters are cached like `computed`. In Option Stores, `this` accesses the full store instance — you can call other getters:

```js
getters: {
  doubleCount(state) { return state.count * 2 },
  doublePlusOne() { return this.doubleCount + 1 }, // access other getter via this
}
```

### Actions — Async & Arguments

Actions can be async, accept any arguments, and mutate state directly via `this`:

```js
actions: {
  async fetchUser(id) {
    this.user = await api.getUser(id)
  },
}
```

### Plugins

```js
function myPlugin({ store, pinia, app }) {
  store.$myMethod = () => { /* ... */ }
}
pinia.use(myPlugin)
```

### Option Stores vs Setup Stores

| | Option Stores | Setup Stores |
|---|---|---|
| Style | `state`/`getters`/`actions` object | `ref`/`computed`/`function` returning object |
| Learning curve | Easier (Options-API-like) | More flexible |
| Watchers inside store | No | Yes (`watch`/`watchEffect`) |
| Composables inside store | No | Yes (caution with SSR) |
| `inject()` access | No | Yes |
| `$reset` | Built-in | Must implement manually |

**Critical for Setup Stores:** You MUST return ALL state properties. Private or readonly state breaks SSR, devtools, and plugins. Do NOT return injected values (e.g. `route`) — access them in components.

## SSR & Hydration Safety

### Cross-Request State Pollution

**Never** use `export const state = reactive({})` in SSR apps — the same object is shared across all requests. Pinia creates a fresh store per request when `useStore()` is called inside `setup()`.

### Using Stores Outside setup()

Pass the `pinia` instance explicitly:

```js
const pinia = createPinia()
app.use(pinia)

router.beforeEach((to) => {
  const main = useMainStore(pinia) // ← pass pinia instance
  if (to.meta.requiresAuth && !main.isLoggedIn) return '/login'
})
```

In Options API: `useStore(this.$pinia)`.

### State Hydration

**Server side** — serialize and escape after rendering:
```js
import devalue from 'devalue'
devalue(pinia.state.value) // embed in HTML
```

**Client side** — hydrate BEFORE any `useStore()` call:
```js
if (isClient) {
  pinia.state.value = JSON.parse(window.__pinia)
}
```

Always escape serialized state to prevent XSS. `devalue` (used by Nuxt) is recommended over raw `JSON.stringify` for security.

## Caveats

1. **Destructuring breaks reactivity** — always use `storeToRefs()` for state/getters, destructure actions directly.
2. **Setup Stores: return all state** — missing state properties break SSR, devtools, and plugins.
3. **Setup Stores: don't return injected values** — `route`, `appProvided` etc. belong to components, not the store.
4. **SSR: hydrate before useStore()** — hydrate `pinia.state.value` on client before any store call, or get state mismatch.
5. **SSR: escape serialized state** — XSS risk if state contains user-controlled content.
6. **SSR: pass pinia outside setup** — required for router guards, `serverPrefetch()`, etc.
7. **Cross-request pollution** — `export const state = reactive({})` is unsafe for SSR. Use Pinia.
8. **$reset only in Option Stores** — Setup Stores need a manual implementation.
9. **Lazy instantiation** — stores don't exist until first `useStore()` call; no pre-call state access.
10. **One store per file** — enables code splitting and optimal TypeScript inference.
11. **Setup Stores + composables + SSR** — can get complex; ensure composables are SSR-safe.
12. **Circular store dependencies are allowed** — unlike Vuex modules.

## Composition Hints

- **For new projects:** prefer Setup Stores — more flexible, composable, and consistent with Composition API.
- **For migrating Vuex projects:** Option Stores map closely to Vuex mental model; use `mapStores`/`mapState`/`mapActions` for incremental migration.
- **SSR apps:** always use `devalue` for state serialization; keep store instantiation inside `setup()`.
- **Testing:** Pinia provides testing utilities — create a fresh pinia instance per test to avoid cross-test pollution.
- **Store composition:** import and call one store inside another's getter/action for cross-store logic — no module nesting needed.
