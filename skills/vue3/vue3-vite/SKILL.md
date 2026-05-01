---
name: vue3-vite
description: Vite build tool configuration, dev server, library mode, and plugin system for Vue 3 projects.
tech_stack: [frontend]
language: [javascript, typescript]
capability: [ci-cd]
version: "Vite unversioned"
collected_at: 2025-07-10
---

# Vite Build Tool for Vue 3

> Source: https://vite.dev/guide/, https://vite.dev/config/, https://vite.dev/plugins/, https://vite.dev/guide/build.html

## Purpose

Vite is a fast, opinionated build tool with a native-ESM dev server (HMR) and a Rolldown-based production bundler. It is the recommended build tool for Vue 3 projects.

## When to Use

- Scaffolding new Vue 3 projects (`create-vue` / `npm create vite@latest`)
- Fast dev server with native ESM HMR on `localhost:5173`
- Production bundling with sensible defaults (Baseline Widely Available targets)
- Library authoring (es/umd/cjs output formats)
- Multi-page applications with multiple HTML entry points
- SSR build setups
- Any project needing a plugin-extensible build pipeline

## Basic Usage

### Scaffold a Vue 3 project
```bash
npm create vite@latest my-vue-app -- --template vue
```

### Manual install
```bash
npm install -D vite
```

### npm scripts
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### Config file (`vite.config.js`)
```js
import { defineConfig } from 'vite'

export default defineConfig({
  // config options
})
```

### Conditional config (dev vs build)
```js
export default defineConfig(({ command, mode, isSsrBuild, isPreview }) => {
  if (command === 'serve') return { /* dev config */ }
  if (command === 'build') return { /* build config */ }
})
```

### Loading env vars in config
```js
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // '' = all vars, not just VITE_
  return {
    server: { port: env.APP_PORT ? Number(env.APP_PORT) : 5173 },
  }
})
```

**Critical:** `.env*` files are NOT loaded during config evaluation. Use `loadEnv()` if config depends on env values.

### Build with public base path
```js
export default defineConfig({
  base: '/my/public/path/'
})
// CLI: vite build --base=/my/public/path/
```

Use `import.meta.env.BASE_URL` for dynamic URLs — statically replaced at build, must appear exactly as-is.

## Key APIs (Summary)

### Library Mode
```js
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'lib/main.js'),
      name: 'MyLib',
      fileName: 'my-lib',
    },
    rolldownOptions: {
      external: ['vue'],
      output: { globals: { vue: 'Vue' } },
    },
  },
})
```

**Output:** Single entry → `es` + `umd`; Multiple entries → `es` + `cjs`. Configurable via `build.lib.formats`.

**CSS:** Bundled as single CSS file (`dist/my-lib.css`). Override name with `build.lib.cssFileName`.

**Env vars:** `import.meta.env.*` statically replaced; `process.env.*` is NOT — consumers can dynamically change it.

### Multi-Page App
```js
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        nested: resolve(import.meta.dirname, 'nested/index.html'),
      },
    },
  },
})
```
Note: Vite ignores the entry name for HTML files — uses the resolved file ID.

### Key Plugins for Vue
| Plugin | Purpose |
|---|---|
| `@vitejs/plugin-vue` | Vue 3 SFC support |
| `@vitejs/plugin-vue-jsx` | Vue 3 JSX support |
| `@vitejs/plugin-legacy` | Legacy browser support for production |

### Stale deployment recovery
```js
window.addEventListener('vite:preloadError', (event) => {
  window.location.reload()
})
```
Set `Cache-Control: no-cache` on the HTML file.

## Caveats

- **Node.js**: Requires ≥20.19 or ≥22.12. Some templates need higher versions.
- **No type-checking**: Vite only transpiles. Use `vue-tsc` or IDE for type checking.
- **No polyfills by default**: Vite handles syntax transforms only. Use `@vitejs/plugin-legacy` for polyfills.
- **`import.meta.env.BASE_URL`**: Must appear exactly as-is — dynamic property access (`['BASE_URL']`) won't work.
- **Relative base** (`base: './'`): Requires `import.meta` support. Use `@vitejs/plugin-legacy` for older browsers.
- **Library mode env vars**: `process.env.*` is left intact. Use `define: { 'process.env.NODE_ENV': '"production"' }` or `esm-env` for static replacement.
- **Library mode**: Opinionated for browser-oriented/JS framework libs. Use `tsdown` or Rolldown directly for non-browser/advanced flows.
- **Config debugging in VS Code**: Add `**/node_modules/.vite-temp/**` to `resolveSourceMapLocations`.

## Composition Hints

- Use `defineConfig` for IDE intellisense — supports both JS and TS configs.
- Use conditional config (function form) to separate dev/build settings by `command`.
- Externalize framework deps (`vue`, `react`) in library mode via `rolldownOptions.external`.
- Pair with `@vitejs/plugin-vue` for `.vue` SFC support; add `@vitejs/plugin-legacy` when targeting older browsers.
- For type-checking, run `vue-tsc --watch` in parallel or use `vite-plugin-checker`.
