---
name: vue3-composition-api
description: Vue 3 Composition API — ref, reactive, computed, watch, watchEffect, lifecycle hooks, and comparison with React Hooks
tech_stack: [vue3]
language: [javascript, typescript]
capability: [state-management, data-fetching]
version: "Vue 3.x"
collected_at: 2025-01-01
---

# Vue 3 Composition API

> Source: https://vuejs.org/guide/essentials/reactivity-fundamentals.html, https://vuejs.org/guide/essentials/computed.html, https://vuejs.org/guide/essentials/watchers.html, https://vuejs.org/guide/essentials/lifecycle.html, https://vuejs.org/guide/extras/composition-api-faq.html

## Purpose

The Composition API is the recommended way to author Vue 3 components using imported functions (`ref`, `reactive`, `computed`, `watch`, `watchEffect`, lifecycle hooks) instead of declaring options. It enables better logic reuse via composables, more flexible code organization, superior TypeScript inference, and smaller production bundles. It is the foundation upon which the Options API is implemented in Vue 3.

## When to Use

- Use **`ref()`** as your default reactive state primitive — it works for all value types (primitives and objects) and retains reactivity when passed into functions
- Use **`reactive()`** for structured form state or config objects you won't destructure
- Prefer **Composition API** when the component has multiple logical concerns, you need TypeScript inference, or you want to extract reusable composables
- Prefer **Options API** for simple components where the prescribed "guard rails" reduce cognitive overhead
- Both APIs coexist — the `setup()` option allows mixing them in a single component

## Basic Usage

### ref() — the primary reactive primitive

```js
import { ref } from 'vue'

const count = ref(0)           // { value: 0 }
console.log(count.value)       // 0
count.value++                  // triggers reactivity
```

In `<script setup>`, refs are auto-unwrapped in templates:

```vue
<script setup>
import { ref } from 'vue'
const count = ref(0)
function increment() { count.value++ }
</script>

<template>
  <button @click="increment">{{ count }}</button>
</template>
```

Refs are deeply reactive — objects assigned as values are converted via `reactive()` internally.

### reactive() — Proxy-based reactive objects

```js
import { reactive } from 'vue'
const state = reactive({ count: 0 })
state.count++   // reactive
```

**Limitations**: only works with objects/arrays/collections (not primitives); cannot replace the entire object without losing reactivity; destructuring a property disconnects it from reactivity.

### computed() — cached derived state

```js
import { ref, computed } from 'vue'

const count = ref(1)
const plusOne = computed(() => count.value + 1)
// plusOne.value → 2, cached until count changes

// Writable computed:
const doubled = computed({
  get: () => count.value * 2,
  set: (val) => { count.value = val / 2 }
})
```

### watch() — explicit dependency watching

```js
import { ref, watch } from 'vue'

const source = ref(0)
watch(source, (newVal, oldVal) => {
  console.log(`Changed from ${oldVal} to ${newVal}`)
})

// Watch a getter (shallow by default):
watch(() => obj.nested.prop, callback)   // only when getter return value changes
watch(() => obj.nested.prop, callback, { deep: true })  // nested mutations too

// Watch a reactive object directly (implicitly deep):
watch(obj, callback)
```

Key options: `immediate: true` (run on creation), `deep: true` (traverse nested; number for depth in 3.5+), `flush: 'post' | 'sync'`, `once: true` (3.4+).

### watchEffect() — auto-tracking effect

```js
import { ref, watchEffect } from 'vue'

const todoId = ref(1)
const data = ref(null)

watchEffect(async () => {
  // Automatically tracks todoId.value — no explicit source needed
  const res = await fetch(`/todos/${todoId.value}`)
  data.value = await res.json()
})
// Runs immediately; re-runs whenever any tracked dependency changes
```

⚠️ Only synchronous property accesses are tracked. Properties read after the first `await` are NOT dependencies.

### Lifecycle Hooks

```js
import { onMounted, onUnmounted } from 'vue'

onMounted(() => console.log('Component mounted'))
onUnmounted(() => console.log('Component unmounted'))
```

All hooks: `onMounted`, `onUpdated`, `onUnmounted`, `onBeforeMount`, `onBeforeUpdate`, `onBeforeUnmount`, `onActivated`, `onDeactivated`, `onErrorCaptured`, `onRenderTracked` (dev), `onRenderTriggered` (dev), `onServerPrefetch` (SSR).

⚠️ Must be called **synchronously** during `setup()` — not inside `setTimeout`, `setInterval`, or after `await`.

### Stopping Watchers

```js
const unwatch = watch(source, callback)
unwatch()  // manual stop

// Pause/resume (Vue 3.4+):
const { stop, pause, resume } = watchEffect(() => {})
```

Synchronously created watchers auto-stop on component unmount. Async-created watchers (inside `setTimeout`, etc.) must be manually stopped.

## Key APIs (Summary)

| API | Signature | Key Behavior |
|-----|-----------|-------------|
| `ref(v)` | `Ref<T>` | Reactive container, `.value` access, deeply reactive for objects |
| `reactive(o)` | `Proxy<T>` | Deep Proxy, object types only, destructure-unfriendly |
| `computed(getter)` | `ComputedRef<T>` | Cached derived state, getter-only default, writable with `{get,set}` |
| `watch(src, cb, opts)` | `WatchHandle` | Lazy, explicit source, multiple source types, `{immediate,deep,flush,once}` |
| `watchEffect(fn, opts)` | `WatchHandle` | Eager, auto-track deps, simpler for multi-dependency side effects |
| `nextTick()` | `Promise<void>` | Resolves after next DOM update cycle |
| `onWatcherCleanup(fn)` | — | Register cleanup inside watch/watchEffect (3.5+) |

## Caveats

- **`reactive()` destructure breaks reactivity** — use `toRefs()` to create refs from a reactive object for safe destructuring
- **`computed` getters must be side-effect free** — no DOM mutation, no async requests, no state mutation; use watchers for side effects
- **`watch(() => obj.count, cb)` not `watch(obj.count, cb)`** — always wrap reactive object properties in a getter
- **`watchEffect` only tracks synchronous access** — anything after the first `await` is invisible
- **Ref unwrapping is inconsistent**: not unwrapped in reactive arrays/maps; in templates, only top-level refs are unwrapped (exception: text interpolation `{{ refInObject }}` works)
- **Deep watchers: `newValue === oldValue`** — both reference the same mutated object
- **Lifecycle hooks must be synchronous** — no `setTimeout(() => onMounted(...))`
- **Async watcher creation = memory leak** — manually call the returned stop handle
- **Never mutate computed values** — treat as read-only snapshots; update the source instead

## Composition Hints

- **Default to `ref()`** not `reactive()` — refs are more flexible and avoid the destructure/replace pitfalls
- **Group related state + logic into composables** (functions named `use*`) — the primary superpower of Composition API
- **Use `watchEffect`** when you have multiple dependencies and don't need old/new value comparison; use **`watch`** when you need lazy execution, old values, or explicit control over what triggers re-execution
- **Pair `<script setup>` with Composition API** — top-level bindings are auto-exposed to the template, reducing boilerplate
- **For React devs**: Composition API's `setup()` runs **once** (no stale closures), computed/watchers auto-track deps (no manual dependency arrays), and Vue's fine-grained reactivity eliminates the need for `useMemo`/`useCallback`
- **Options API is built on top of Composition API** — you can use `setup()` inside an Options component to gradually migrate
