---
name: vue3-ssr
description: Server-Side Rendering (SSR) with Vue 3 — render components to HTML strings on the server, hydrate on the client, and manage universal code safely.
tech_stack: [vue3]
language: [javascript]
capability: [web-framework]
version: "Vue 3 unversioned"
collected_at: 2025-07-16
---

# Vue3 Server-Side Rendering (SSR)

> Source: https://vuejs.org/guide/scaling-up/ssr, https://vuejs.org/api/ssr

## Purpose

Vue SSR renders Vue components into HTML strings on the server, sends them to the browser, and then "hydrates" the static markup into a fully interactive client-side app. The same app code runs on both server and client (universal/isomorphic). This delivers faster time-to-content, better SEO, and a unified development model.

## When to Use

- **Time-to-content is critical** — content sites, e-commerce, landing pages where load speed directly impacts conversion.
- **SEO matters** and content is fetched asynchronously (search crawlers don't wait for Ajax).
- **Unified codebase** — you want one component model across the full stack.
- **NOT for** internal dashboards, SPAs behind auth, or apps where an extra few hundred ms don't matter.
- **Consider SSG (Static Site Generation)** if data is the same for every user — pre-render at build time instead of per-request. Cheaper and easier to deploy.

## Basic Usage

### Bare-bones render

```js
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

const app = createSSRApp({
  data: () => ({ count: 1 }),
  template: `<button @click="count++">{{ count }}</button>`
})

const html = await renderToString(app)
// → "<button>1</button>"
```

### Universal App Factory Pattern

The critical pattern: a shared `createApp()` factory that returns a **fresh instance per request**:

```js
// app.js — shared between server AND client
import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'

export function createApp() {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  return { app, pinia }
}
```

```js
// client.js — browser entry
import { createApp } from './app.js'
const { app } = createApp()
app.mount('#app')  // hydrates, does NOT re-render
```

```js
// server.js — Node.js request handler
import { createApp } from './app.js'
import { renderToString } from 'vue/server-renderer'

server.get('*', async (req, res) => {
  const { app } = createApp()  // fresh per request!
  const html = await renderToString(app)
  res.send(template(html))  // embed in full HTML shell
})
```

### Streaming Render

```js
// Node.js: pipe directly to response
import { pipeToNodeWritable } from 'vue/server-renderer'
pipeToNodeWritable(app, {}, res)

// Web Streams (Cloudflare Workers, Deno, etc.)
import { renderToWebStream } from 'vue/server-renderer'
return new Response(renderToWebStream(app))
```

### SSR Context & Teleports

```js
const ctx = {}
const html = await renderToString(app, ctx)
// Teleported content is NOT in `html` — it's in ctx.teleports:
console.log(ctx.teleports) // { '#teleported': 'teleported content' }
// Manually inject into final HTML shell at the correct location.
```

In components, access the context via:
```js
import { useSSRContext } from 'vue'
if (import.meta.env.SSR) {
  const ctx = useSSRContext()
  ctx.head = '...'  // attach metadata for the HTML shell
}
```

### Client Hydration

Use `createSSRApp()` on both sides. On the client, `mount('#app')` detects the pre-rendered HTML and hydrates (attaches listeners, doesn't recreate DOM). The app implementation must be **identical** on server and client.

## Key APIs (Summary)

| API | Export | Returns |
|-----|--------|---------|
| `renderToString(app, ctx?)` | `vue/server-renderer` | `Promise<string>` |
| `pipeToNodeWritable(app, ctx, writable)` | `vue/server-renderer` | `void` (pipes to Node.js Writable) |
| `renderToWebStream(app, ctx?)` | `vue/server-renderer` | `ReadableStream` |
| `renderToSimpleStream(app, ctx, opts)` | `vue/server-renderer` | `SimpleReadable` with `push`/`destroy` |
| `useSSRContext()` | `vue` | SSR context object (only during SSR) |
| `createSSRApp(...)` | `vue` | App instance for SSR (use instead of `createApp`) |

Use `renderToNodeStream` only in CJS; ESM builds require `pipeToNodeWritable`.

## Caveats

### Lifecycle Hooks — only these run during SSR

- ✅ **Run on server**: `beforeCreate`, `created`, `setup()` / `<script setup>` root scope
- ❌ **Client-only** (NOT called during SSR): `mounted`/`onMounted`, `updated`/`onUpdated`, `unmounted`/`onUnmounted`, `beforeUnmount`/`onBeforeUnmount`

**Side-effect rule**: Never put side effects that need cleanup (timers, subscriptions) in `setup()` or `created`. Move them to `onMounted()`.

### Cross-Request State Pollution

Modules are initialized **once** at server boot and reused across all requests. Any singleton state in module root scope leaks between users.

```js
// ❌ DANGEROUS — shared across all requests
const globalState = reactive({ user: null })

// ✅ SAFE — create fresh per request
export function createApp() {
  const state = reactive({ user: null })
  app.provide('state', state)
}
```

Always create router, stores, and app instances **per request**. Pinia handles this automatically when used with `createPinia()` inside the factory.

### Hydration Mismatch

Happens when server-rendered HTML differs from what the client would render. Three common causes:

1. **Invalid HTML nesting** — e.g., `<p><div/></p>` → browser auto-corrects. Avoid invalid nesting in templates.
2. **Random values** — `Math.random()` produces different values server vs client. Guard with `v-if` + `onMounted` or use seeded RNG.
3. **Time zones** — `toLocaleString()` depends on server timezone ≠ client timezone. Defer to client-only rendering.

Vue auto-recovers from mismatches but at a rendering performance cost. Suppress unavoidable mismatches (Vue 3.5+):
```html
<div data-allow-mismatch="text">{{ data.toLocaleString() }}</div>
```

### Platform APIs

Universal code cannot use `window`/`document` directly — they throw in Node.js. Access browser-only APIs lazily inside `onMounted()`. For shared needs (e.g., `fetch`), use isomorphic libraries (`node-fetch`, `cross-fetch`).

### Teleports

Teleported content is excluded from `renderToString()` output. Access via `ctx.teleports` and inject into the HTML shell. **Never target `body`** — use a dedicated container: `<div id="teleported"></div>`.

### Custom Directives

Directives doing DOM manipulation are ignored during SSR. Provide server behavior via `getSSRProps`:
```js
const vFocus = {
  mounted(el) { el.focus() },
  getSSRProps(binding) { return { autofocus: '' } }
}
```

### Reactivity is disabled during SSR

No user interaction or DOM updates happen on the server, so Vue disables reactivity for performance. Don't rely on watchers or computed during SSR.

## Composition Hints

- **Always use a higher-level framework for production**: Nuxt (universal Vue apps + SSG), Quasar (multi-target), or Vite SSR with `vite-plugin-ssr`. Raw `vue/server-renderer` requires coordinating dual builds, asset manifests, routing, and data fetching.
- **Use `createSSRApp()` uniformly** — never mix `createApp()` and `createSSRApp()` in the same project.
- **Pinia is SSR-ready** — call `createPinia()` inside your app factory per request. Avoid module-level store instances.
- **Route-level data fetching**: Use `vue-router`'s navigation guards or Nuxt's `useFetch`/`useAsyncData` to fetch data before rendering completes.
- **Client-only components**: Wrap browser-specific components in `<ClientOnly>` (Nuxt) or use `v-if` + `onMounted` to defer rendering to the client.
- **SSR Context for head management**: Use `useSSRContext()` to collect `<title>`, `<meta>`, and `<link>` tags during render, then emit them in the HTML shell.
