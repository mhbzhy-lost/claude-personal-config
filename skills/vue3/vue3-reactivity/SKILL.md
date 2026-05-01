---
name: vue3-reactivity
description: Vue 3 reactivity system internals — Proxy-based track/trigger, reactive effects, advanced APIs (shallowRef, customRef, effectScope), and integration with external state systems
tech_stack: [vue3]
language: [javascript, typescript]
capability: [state-management, observability]
version: "Vue 3.x"
collected_at: 2025-01-01
---

# Vue 3 Reactivity System

> Source: https://vuejs.org/guide/extras/reactivity-in-depth.html, https://vuejs.org/api/reactivity-core.html, https://vuejs.org/api/reactivity-advanced.html

## Purpose

Vue 3's reactivity system is the engine behind automatic view updates. It uses **Proxy** (for `reactive()`) and **getter/setters** (for `ref()`) to intercept property access and mutation, maintaining a dependency graph of `WeakMap<target, Map<key, Set<effect>>>`. When reactive state changes, the system efficiently notifies only the effects (component renders, watchers, computed properties) that depend on the changed data.

## When to Use

- Understand the internals when **debugging unexpected reactivity behavior** or missing updates
- Use **`shallowRef()`** when integrating external state libraries (Immer, XState, RxJS) — the inner value is left intact, only `.value` replacement triggers updates
- Use **`customRef()`** for custom track/trigger logic (debounced refs, conditional invalidation)
- Use **`effectScope()`** when creating composables that manage watchers/computed outside of `setup()` context
- Use **`toRaw()` / `markRaw()`** to opt out of reactivity for third-party class instances, large immutable lists, or Vue component objects
- Use **debugging hooks** (`onRenderTracked`, `onRenderTriggered`, `onTrack`/`onTrigger` on computed/watchers) to trace dependency tracking and update triggers (dev only)

## Basic Usage

### Core mechanism: track & trigger

Every property access on a reactive object or `.value` read on a ref calls `track(target, key)`, which registers the currently running `activeEffect` as a subscriber. Every property write calls `trigger(target, key)`, which invokes all subscriber effects.

```
WeakMap<target, Map<key, Set<effect>>>
```

Pseudo-code:

```js
// Proxy-based reactive()
function reactive(obj) {
  return new Proxy(obj, {
    get(target, key) {
      track(target, key)
      return target[key]
    },
    set(target, key, value) {
      target[key] = value
      trigger(target, key)
    }
  })
}

// Getter/setter-based ref()
function ref(value) {
  return {
    get value() { track(refObject, 'value'); return value },
    set value(v) { value = v; trigger(refObject, 'value') }
  }
}
```

### Reactive effects

```js
let activeEffect

function whenDepsChange(update) {
  const effect = () => {
    activeEffect = effect   // set self as active
    update()                // run → track() calls register this effect
    activeEffect = null     // clear
  }
  effect()                  // run once to seed dependencies
}
```

`watchEffect()` is the public API for creating reactive effects. `computed()` uses a reactive effect internally for invalidation/re-computation. Every component instance creates a reactive effect to render and update the DOM.

### Runtime vs. compile-time reactivity

Vue's reactivity is **runtime-based**: tracking and triggering happen in the browser without a build step. This means fewer edge cases but requires value containers (refs). Contrast with Svelte's compile-time approach. Vue's experimental Reactivity Transform was discontinued.

### Options API relationship

In Vue 3, the Options API is implemented **on top of** the Composition API. `this.property` access triggers getter/setters; `watch` and `computed` options invoke their Composition API equivalents internally.

## Key APIs (Summary)

### Core

| API | Mechanism | Deep? | Notes |
|-----|-----------|-------|-------|
| `ref(v)` | Getter/setter on `.value` | Yes (objects via `reactive()`) | Use `shallowRef` to opt out |
| `reactive(o)` | Proxy | Yes, recursive | Object/array/collection types only; `proxy !== raw` |
| `computed(getter)` | Reactive effect + cache | Tracks deps | Read-only default; writable with `{get, set}` |
| `readonly(o)` | Proxy (read-only traps) | Yes | Nested refs unwrapped but made readonly |
| `watch(src, cb)` | Explicit source tracking | Shallow (getter) / Deep (reactive obj direct) | Lazy; options: `immediate`, `deep`, `flush`, `once` (3.4+) |
| `watchEffect(fn)` | Auto-track all sync access | As deep as accessed | Eager (runs immediately); `flush: 'post'|'sync'` |
| `onWatcherCleanup(fn)` | — | — | Register cleanup inside watch/watchEffect (3.5+, sync-only) |

### Advanced

| API | Purpose |
|-----|---------|
| `shallowRef(v)` | Only `.value` access is reactive; inner value untouched — for external state libs, large data |
| `triggerRef(r)` | Manually trigger effects on a `shallowRef` after deep mutations |
| `customRef(factory)` | Full control over `track()`/`trigger()` — debounced refs, custom invalidation |
| `shallowReactive(o)` | Only root-level properties reactive; no deep conversion, no ref unwrapping |
| `shallowReadonly(o)` | Only root-level properties readonly |
| `toRaw(proxy)` | Extract original object from a reactive/readonly proxy (escape hatch) |
| `markRaw(o)` | Prevent an object from ever being proxied |
| `effectScope(detached?)` | Container for collective disposal of effects (computed, watchers) |
| `getCurrentScope()` | Returns active `EffectScope` or `undefined` |
| `onScopeDispose(fn)` | Register cleanup on current scope — non-component `onUnmounted` for composables |

### Debugging (dev only)

```js
// Component-level hooks
onRenderTracked((event) => { debugger })   // dep tracked during render
onRenderTriggered((event) => { debugger }) // dep triggered re-render

// Computed debugging
computed(() => count.value + 1, {
  onTrack(e) { debugger },
  onTrigger(e) { debugger }
})

// Watcher debugging
watch(source, cb, { onTrack(e) {}, onTrigger(e) {} })
watchEffect(fn, { onTrack(e) {}, onTrigger(e) {} })
```

DebuggerEvent shape: `{ effect, target, type, key, newValue?, oldValue?, oldTarget? }`

## Caveats

- **`reactive()` proxy identity**: `reactive(raw) !== raw`. Always use the proxy; `toRaw()` is an escape hatch, not for persistent references.
- **Destructuring breaks Proxy traps**: `const { count } = reactive({count: 0})` — `count` is now a plain number, disconnected from the proxy. Use `toRefs()`.
- **`ref()` always deeply converts objects**: Use `shallowRef()` for large objects or external state holders.
- **Ref unwrapping is NOT universal**: Ref values inside reactive arrays/collections need `.value`. Only top-level template refs auto-unwrap.
- **`watch(() => obj.prop, cb)` is shallow**: Nested mutations don't fire. Add `{ deep: true }`. Direct `watch(obj, cb)` is implicitly deep.
- **`newValue === oldValue` in deep watchers**: Both point to the same mutated object.
- **`watchEffect` + async**: Only dependencies accessed before the first `await` are tracked.
- **`markRaw()` identity hazard**: `markRaw({nested: {}})` — the nested object is NOT marked. Placing `nested` into a reactive object creates two identities.
- **`shallowReactive()` nesting**: Only use at root level. Nesting inside deep reactive objects creates inconsistent reactivity trees.
- **`customRef` + new object return**: If the getter returns a new object each call, passing as a prop causes unnecessary child re-renders — the parent's re-render (from unrelated state) re-evaluates the getter.
- **Async watcher creation leaks**: `setTimeout(() => watchEffect(...))` — not bound to component, must call returned stop handle.
- **`onWatcherCleanup` sync constraint** (3.5+): Cannot be called after `await`.

## Composition Hints

- **`shallowRef` is the bridge for external state** — hold Immer/XState/RxJS state in a `shallowRef`, replace `.value` on change to trigger Vue's reactivity
- **`effectScope` for composable libraries** — if your composable creates watchers/computed outside a component's `setup()`, wrap them in an `effectScope` and expose `stop()` for proper cleanup
- **`onScopeDispose` as portable `onUnmounted`** — use in composables instead of `onUnmounted` to avoid coupling to component lifecycle
- **`customRef` for non-standard invalidation** — debounce, throttle, conditional updates, or integration with non-Vue event sources
- **`triggerRef` after deep mutation on `shallowRef`** — mutate the inner object directly for performance, then call `triggerRef` once to batch-notify effects
- **Solid/Angular signal patterns are replicable** — use `shallowRef` to build `createSignal()` (read/write segregated) or Angular-style `.set()`/`.update()` APIs within Vue
- **Vapor Mode (future)**: Vue is exploring a Solid-inspired compilation strategy that skips Virtual DOM, leveraging the reactivity system more directly for fine-grained DOM updates
