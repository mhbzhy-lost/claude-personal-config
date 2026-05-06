---
name: tanstack-query-devtools
description: Install and configure TanStack Query DevTools v5 to inspect queries, mutations, cache state, and trigger manual actions during development.
tech_stack: [react]
language: [typescript]
capability: [observability, data-fetching]
version: "TanStack Query v5"
collected_at: 2026-07-11
---

# TanStack Query — DevTools

> Source: https://tanstack.com/query/latest/docs/framework/react/devtools

## Purpose

The React Query DevTools visualize every query and mutation in your cache: status, data, staleness, and metadata. Since v5, they also observe **mutations**. Available as a floating toggle or an embeddable panel for integration into custom dev tooling.

## When to Use

- **Development**: Always. Install alongside React Query to inspect cache, trigger refetches/invalidations, and simulate errors.
- **Production debugging**: Lazy-load on demand via `window.toggleDevtools()`.
- **Custom dev tooling**: Use `ReactQueryDevtoolsPanel` (Embedded Mode) to embed inside your own debug UI.

## Basic Usage

### Floating Mode (recommended default)

```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

A toggle button appears at `bottom-right`. Panel expands from `bottom`. The open/closed state persists in `localStorage`.

### Embedded Mode

```tsx
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'

function App() {
  const [open, setOpen] = React.useState(false)
  return (
    <QueryClientProvider client={queryClient}>
      <button onClick={() => setOpen(!open)}>Toggle DevTools</button>
      {open && <ReactQueryDevtoolsPanel onClose={() => setOpen(false)} />}
    </QueryClientProvider>
  )
}
```

## Key APIs (Summary)

| Export | Mode | Use case |
|--------|------|----------|
| `ReactQueryDevtools` | Floating | Fixed toggle button + expandable panel. Zero-config default. |
| `ReactQueryDevtoolsPanel` | Embedded | Render panel inline; you control visibility and positioning. |

### Common options (both modes)

| Option | Default | Notes |
|--------|---------|-------|
| `client` | nearest `QueryClientProvider` | Pass a custom `QueryClient` if needed |
| `errorTypes` | — | `{ name: string; initializer: (query) => Error }[]` — predefine injectable errors |
| `styleNonce` | — | CSP nonce for inline styles |
| `shadowDOMTarget` | — | `ShadowRoot` for style injection in Shadow DOM apps |
| `theme` | `"system"` | `"light"` / `"dark"` / `"system"` |

### Floating-only options

| Option | Default | Values |
|--------|---------|--------|
| `initialIsOpen` | `false` | Start with panel open |
| `buttonPosition` | `"bottom-right"` | `"top-left"`, `"top-right"`, `"bottom-left"`, `"bottom-right"`, `"relative"` |
| `position` | `"bottom"` | `"top"`, `"bottom"`, `"left"`, `"right"` |

### Embedded-only options

| Option | Default | Notes |
|--------|---------|-------|
| `style` | `{ height: '500px' }` | Custom CSS; e.g. `{ height: '100%', width: '100%' }` |
| `onClose` | — | Callback when user closes the panel |

### Production lazy-loading

DevTools are automatically tree-shaken when `NODE_ENV !== 'development'`. To make them available on demand in production:

```tsx
const ReactQueryDevtoolsProduction = React.lazy(() =>
  import('@tanstack/react-query-devtools/production').then(d => ({
    default: d.ReactQueryDevtools,
  })),
)

// Toggle with:
window.toggleDevtools = () => setShowDevtools(prev => !prev)
```

For TypeScript, use `moduleResolution: 'nodenext'` (TS ≥ 4.7) with the shorter `'.../production'` path, or use the legacy full path: `'@tanstack/react-query-devtools/build/modern/production.js'`.

## Caveats

- **Next.js 13+ App Router**: Install as a **dev dependency** (`-D`).
- **Place near root**: Render `<ReactQueryDevtools>` as high as possible in the tree, ideally right inside `<QueryClientProvider>`.
- **Shadow DOM**: Without `shadowDOMTarget`, styles inject into `<head>` — pass the `ShadowRoot` if your app uses Shadow DOM.
- **CSP**: If your Content Security Policy blocks inline styles, pass `styleNonce`.
- **Toggle state**: Stored in `localStorage` — open/closed persists across reloads for the same origin.

## Composition Hints

- Always place inside `<QueryClientProvider>` so it inherits the client context.
- The dev `ReactQueryDevtools` (non-lazy) is already excluded from production builds — only the lazy `<ReactQueryDevtoolsProduction>` needs manual wiring.
- Combine with browser extensions (Chrome/Firefox/Edge) for a richer debugging experience without modifying app code.
