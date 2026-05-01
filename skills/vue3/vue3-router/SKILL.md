---
name: vue3-router
description: Vue Router 4 — official client-side routing for Vue 3 SPAs: dynamic routes, navigation guards, lazy loading, scroll behavior, and history modes.
tech_stack: [vue3]
language: [javascript, typescript]
capability: [routing]
version: "Vue Router 4.x"
collected_at: 2025-07-09
---

# Vue Router 4

> Source: https://router.vuejs.org/guide/, https://router.vuejs.org/api/, https://router.vuejs.org/guide/advanced/navigation-guards.html

## Purpose

Vue Router is the official client-side routing solution for Vue 3. It ties the browser URL to the content rendered in a single-page application (SPA), enabling navigation without page reloads. Built on Vue's component system, it maps URL paths to components via a declarative route configuration.

## When to Use

- Any Vue 3 SPA needing URL-based navigation with multiple views
- Applications requiring route guards for authentication/authorization
- Apps with nested layouts, named views, or lazy-loaded route segments
- Scenarios needing programmatic navigation or scroll behavior control

## Basic Usage

**Installation & setup:**
```js
// router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './HomeView.vue'
import AboutView from './AboutView.vue'

const routes = [
  { path: '/', component: HomeView },
  { path: '/about', component: AboutView },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
```

```js
// main.js
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'

createApp(App).use(router).mount('#app')
```

**Template:**
```vue
<template>
  <nav>
    <RouterLink to="/">Home</RouterLink>
    <RouterLink to="/about">About</RouterLink>
  </nav>
  <RouterView />
</template>
```

**Accessing router/route in components:**
```js
// Composition API
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()
router.push('/about')          // programmatic navigation
const search = route.query.search

// Options API
this.$router.push('/about')
this.$route.fullPath
```

**History modes:**
- `createWebHistory()` — HTML5 history (most common; requires server fallback config)
- `createWebHashHistory()` — hash-based (no server config needed)
- `createMemoryHistory()` — in-memory (SSR / testing)

## Key APIs (Summary)

| API | Purpose |
|---|---|
| `createRouter({ history, routes })` | Create router instance |
| `router.beforeEach((to, from) => {})` | Global before guard — return `false` to cancel, a route to redirect |
| `router.beforeResolve((to) => {})` | Global resolve guard — fires after in-component guards |
| `router.afterEach((to, from, failure?) => {})` | Global after hook (analytics, title change) — cannot affect navigation |
| `router.push(to)` / `router.replace(to)` | Programmatic navigation |
| `router.addRoute(name?, route)` / `router.removeRoute(name)` | Dynamic route management |
| `router.resolve(location)` | Resolve route location without navigating |
| `useLink(props)` | RouterLink internal behavior for custom link components |
| `isNavigationFailure(error)` | Type guard for navigation failures |

**Route config options:**
```js
{
  path: '/users/:id',
  name: 'user',
  component: () => import('./UserDetails.vue'),  // lazy loading
  children: [],                    // nested routes
  redirect: { name: 'home' },      // redirection
  alias: '/u/:id',
  meta: { requiresAuth: true },    // arbitrary metadata
  beforeEnter: [(to, from) => {}], // per-route guard (array for reuse)
  props: true,                     // pass route.params as component props
}
```

**Navigation guard return values (Vue Router 4):**
- `false` — cancel navigation
- Route location object/string — redirect (like `router.push()`)
- `undefined` / `true` — proceed
- Throw `Error` — cancel, calls `router.onError()`

**In-component guards (Composition API):**
```js
import { onBeforeRouteUpdate, onBeforeRouteLeave } from 'vue-router'
onBeforeRouteLeave((to, from) => { if (hasUnsaved) return false })
```

**In-component guards (Options API):**
```js
beforeRouteEnter(to, from, next) { next(vm => { /* vm = component instance */ }) }
beforeRouteUpdate(to, from) { this.name = to.params.name }
beforeRouteLeave(to, from) { if (!confirm('Leave?')) return false }
```

**Navigation resolution order:** `beforeRouteLeave` → `beforeEach` → `beforeRouteUpdate` → `beforeEnter` → resolve async components → `beforeRouteEnter` → `beforeResolve` → navigation confirmed → `afterEach` → DOM update → `next` callbacks.

## Caveats

- **Legacy `next()`:** Deprecated in Vue Router 4. Must be called exactly once per guard execution — multiple calls cause errors. Always prefer returning values.
- **`beforeRouteEnter` has no `this`:** Component instance doesn't exist yet. Only guard supporting `next(vm => {})` callback pattern.
- **Infinite redirect loops:** Always guard with a target check: `if (!isAuth && to.name !== 'Login') return { name: 'Login' }`.
- **`beforeEnter` on parent routes** does NOT fire when navigating between children of the same parent. Place it on child routes instead.
- **`beforeRouteUpdate`** only fires when the same component is reused (params/query change). Different component = not called.
- **`createWebHistory()`** requires server-side fallback to `index.html` for all routes, otherwise direct URL access returns 404.
- **Inject/Pinia in guards** supported since Vue 3.3 via `inject()` inside `beforeEach`/`beforeResolve`/`afterEach`.
- **`START_LOCATION`** can distinguish the initial navigation from subsequent ones in guards.

## Composition Hints

- **Auth guard pattern:** Use `router.beforeEach` with `to.meta.requiresAuth` + redirect to login. Check `to.name !== 'Login'` to prevent redirect loops.
- **Per-route guards** (`beforeEnter`) are ideal for route-specific validation (permissions, data preloading checks) without polluting global guards.
- **Use `beforeResolve`** when you need to run logic after async components have resolved but before navigation confirms — e.g., fetching data that the route depends on.
- **`scrollBehavior`** for preserving scroll position on back/forward navigation, or scrolling to hash anchors.
- **Dynamic routing** (`addRoute`/`removeRoute`) for scenarios like admin panels that lazy-register routes based on user permissions.
- **Named views** (`components: { default: MainContent, sidebar: Sidebar }`) for complex layouts with multiple outlets in one route.
- **Lazy loading** via dynamic imports (`() => import('./View.vue')`) for automatic route-level code splitting.
- **Type-safe route meta:** Augment `RouteMeta` interface with `declare module 'vue-router'`.
