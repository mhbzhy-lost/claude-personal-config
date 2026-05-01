---
name: vue3-component-patterns
description: Vue 3 component design patterns — provide/inject, slots (named/scoped), KeepAlive, Teleport, Suspense, and fallthrough attributes for building composable UIs.
tech_stack: [vue3]
language: [javascript, typescript]
capability: [state-management, ui-overlay, ui-layout]
version: "Vue 3.x"
collected_at: 2025-07-09
---

# Vue 3 Component Design Patterns

> Source: https://vuejs.org/guide/components/provide-inject.html, https://vuejs.org/guide/components/slots.html, https://vuejs.org/guide/built-ins/keep-alive.html, https://vuejs.org/guide/built-ins/teleport.html, https://vuejs.org/guide/built-ins/suspense.html, https://vuejs.org/guide/components/attrs.html

## Purpose

Core Vue 3 patterns for component communication, content distribution, DOM portaling, async orchestration, caching, and attribute forwarding. These patterns replace the need for global state or event buses in many scenarios and form the backbone of reusable Vue component design.

## When to Use

| Pattern | Use When |
|---|---|
| **Provide/Inject** | Deeply nested component needs data from a distant ancestor — avoid props drilling |
| **Named Slots** | Building layout/wrapper components with multiple content insertion points |
| **Scoped Slots** | Child exposes data to parent for rendering customization (lists, tables, data-driven UIs) |
| **KeepAlive** | Preserve component state when dynamically switching (tabs, wizards, multi-step forms) |
| **Teleport** | Modals, tooltips, dropdowns that break out of `overflow:hidden`/`z-index` stacking |
| **Suspense** | Unified loading state for multiple async components or async `setup()` |
| **Fallthrough Attrs** | Wrapper components that pass `class`/`style`/event listeners to inner elements |

## Basic Usage

### Provide / Inject

```js
// === Provider (ancestor) ===
import { provide, ref, readonly } from 'vue'

const count = ref(0)
const location = ref('North Pole')
function updateLocation() { location.value = 'South Pole' }

provide('count', readonly(count))              // injectors can't mutate
provide('location', { location, updateLocation })  // expose mutation function

// === Injector (any descendant) ===
import { inject } from 'vue'

const count = inject('count')                         // required
const msg = inject('message', 'default')              // with default
const val = inject('key', () => new Heavy(), true)     // factory default (3rd arg=true)
const { location, updateLocation } = inject('location')

// Symbol keys (recommended for large apps):
// keys.js: export const MY_KEY = Symbol()
// provide(MY_KEY, data)  →  inject(MY_KEY)
```

Options API: `provide()` returning plain `this.xxx` is **NOT** reactive — wrap with `computed()`. Inject via `inject: ['key']` or `inject: { local: { from: 'key', default: 'x' } }`.

**App-level provide** (`app.provide('key', value)`) — available to all components; useful for plugins.

### Slots

```vue
<!-- === Default slot === -->
<!-- Child -->
<button class="fancy-btn"><slot>Fallback</slot></button>
<!-- Parent -->
<FancyButton>Click me!</FancyButton>

<!-- === Named slots === -->
<!-- Child: BaseLayout -->
<header><slot name="header"></slot></header>
<main><slot></slot></main>          <!-- implicit "default" -->
<footer><slot name="footer"></slot></footer>

<!-- Parent -->
<BaseLayout>
  <template #header><h1>Title</h1></template>
  <p>Main content</p>               <!-- implicit default slot -->
  <template #footer><p>Contact</p></template>
</BaseLayout>

<!-- === Conditional slot wrapper === -->
<div v-if="$slots.header" class="card-header"><slot name="header" /></div>

<!-- === Scoped slots (child → parent data) === -->
<!-- Child -->
<slot :text="greeting" :count="1"></slot>
<!-- Parent -->
<MyComponent v-slot="{ text, count }">{{ text }} {{ count }}</MyComponent>

<!-- Named scoped slots -->
<MyComponent>
  <template #header="{ message }">{{ message }}</template>
  <template #default="{ text, count }">{{ text }} {{ count }}</template>
</MyComponent>
```

**Critical rule:** When mixing named slots with a scoped default slot, use explicit `<template #default="{ ... }">`. Placing `v-slot` directly on the component tag alongside named slots causes a compile error.

### KeepAlive

```vue
<KeepAlive include="a,b" :max="10">
  <component :is="activeComponent" />
</KeepAlive>
```

- `include`/`exclude`: comma-string, regex, or array — matched against component `name`
- `max`: LRU eviction when exceeded
- Lifecycle: `onActivated()` (initial mount + every cache re-insert), `onDeactivated()` (cache entry + unmount) — works on all descendants in cached tree

### Teleport

```vue
<Teleport to="body" :disabled="isMobile">
  <div v-if="open" class="modal">...</div>
</Teleport>
```

- Target must exist in DOM at mount time. Vue 3.5+: `defer` attr targets same-tick Vue-rendered elements.
- Logical hierarchy preserved: props, events, injections still flow as if not teleported.
- Multiple Teleports to same target — content appends in mount order.

### Suspense (Experimental)

```vue
<Suspense @resolve="onReady" :timeout="0">
  <Dashboard />
  <template #fallback>Loading...</template>
</Suspense>
```

Waits on two async dependency types: (1) components with async `setup()` / top-level `await`, (2) Async Components. Only one immediate child per slot. Once resolved, only reverts if `#default` root node is replaced. Error handling via `onErrorCaptured()`, not built-in.

**Optimal nesting with RouterView:**
```vue
<RouterView v-slot="{ Component }">
  <Transition mode="out-in">
    <KeepAlive>
      <Suspense>
        <component :is="Component" />
        <template #fallback>Loading...</template>
      </Suspense>
    </KeepAlive>
  </Transition>
</RouterView>
```

### Fallthrough Attributes

```vue
<script setup>
defineOptions({ inheritAttrs: false })  // disable auto-inheritance
</script>

<template>
  <div class="wrapper">
    <button class="btn" v-bind="$attrs">Click Me</button>
  </div>
</template>
```

- Single-root components: `class`/`style`/`v-on` listeners auto-fallthrough to root (merged with existing values)
- Multi-root: no auto-fallthrough; must bind `$attrs` explicitly or get runtime warning
- `$attrs` preserves original casing (`$attrs['foo-bar']`), listeners as `$attrs.onClick`
- Access in JS: `useAttrs()` (non-reactive; use `onUpdated()` for side effects) or `ctx.attrs` in `setup()`

## Key APIs (Summary)

| Mechanism | Composition API | Options API |
|---|---|---|
| Provide | `provide(key, value)` | `provide: { key: value }` or `provide() { return {} }` |
| Inject | `inject(key, default?, factory?)` | `inject: ['key']` or `inject: { alias: { from, default } }` |
| Slots | `useSlots()` | `this.$slots` |
| Attrs | `useAttrs()` | `this.$attrs` / `setup(props, ctx) → ctx.attrs` |
| KeepAlive hooks | `onActivated()`, `onDeactivated()` | `activated()`, `deactivated()` |

## Caveats

- **Provide reactivity gap (Options API):** `provide() { return { msg: this.msg } }` is static. Must wrap with `computed()` to be reactive.
- **Provide mutations:** Co-locate mutations with the provider. Use `readonly()` to prevent injector-side writes. Expose mutation functions for controlled updates.
- **Scoped slots + named slots mixing:** Requires explicit `<template #default="props">`. Using `v-slot` on the component tag alongside named `<template #...>` slots is a compile error.
- **KeepAlive `include`/`exclude`:** Matches component `name` option. Set `name` explicitly or rely on filename inference (`<script setup>`, 3.2.34+).
- **Teleport target timing:** Must be in DOM before mount. `defer` (3.5+) relaxes this for same-tick Vue elements.
- **Suspense experimental:** API unstable. Only one immediate child per slot. No built-in error boundary — use `onErrorCaptured()`.
- **`useAttrs()` is non-reactive:** For reactive attribute access, declare as props. Use `onUpdated()` for side effects on latest attrs.
- **Multi-root fallthrough:** No automatic inheritance. Must explicitly `v-bind="$attrs"` on one element.
- **Nested Suspense without `suspensible`:** Inner Suspense treated as sync; causes empty node flashes during transitions.
