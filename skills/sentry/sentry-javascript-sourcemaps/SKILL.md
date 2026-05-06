---
name: sentry-javascript-sourcemaps
description: Upload source maps to Sentry via wizard, bundler plugins (Webpack/Vite/Rollup/esbuild), or CLI — Debug ID injection, CI integration, and troubleshooting.
tech_stack: [frontend]
language: javascript
capability: [observability, ci-cd]
version: "Sentry JavaScript SDK unversioned"
collected_at: 2025-01-01
---

# Sentry JavaScript Source Maps

> Source: https://docs.sentry.io/platforms/javascript/sourcemaps/, https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/, https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/

## Purpose

Upload source maps to Sentry so production stack traces resolve to original source code instead of minified bundles. Covers the Sentry Wizard, per-bundler plugins (Webpack, Vite, Rollup, esbuild), Sentry CLI manual uploads, Debug ID injection, CI integration, and common troubleshooting.

## When to Use

- **Always** for any production JavaScript/TypeScript build that is minified or bundled
- Source maps are required for Sentry error monitoring to show readable stack traces
- **Not** needed for development builds — only production builds generate and upload source maps

## Basic Usage

### Quickest: Sentry Wizard (recommended)

```bash
npx @sentry/wizard@latest -i sourcemaps
```

The wizard interactively logs you into Sentry, selects your project, installs the right plugin packages, and configures your build tool. It also guides you through CI setup.

### Manual plugin setup by bundler

**Vite** (recommended for new projects):
```bash
npm install @sentry/vite-plugin --save-dev
```
```javascript
// vite.config.js
import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig({
  build: { sourcemap: true },
  plugins: [
    sentryVitePlugin({
      org: "your-org",
      project: "your-project",
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
});
```

**Webpack**:
```bash
npm install @sentry/webpack-plugin --save-dev
```
```javascript
// webpack.config.js
const { sentryWebpackPlugin } = require("@sentry/webpack-plugin");

module.exports = {
  devtool: "source-map",
  plugins: [
    sentryWebpackPlugin({
      org: "your-org",
      project: "your-project",
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
};
```

### Sentry CLI (for custom/unsupported toolchains)

```bash
# Upload a directory of source maps
sentry-cli sourcemaps upload ./dist

# With release association (recommended)
sentry-cli releases new my-app@2.0.0
sentry-cli sourcemaps upload ./dist --release my-app@2.0.0
```

## Key APIs (Summary)

### Plugin packages

| Bundler | Package | Config file |
|---------|---------|-------------|
| Vite | `@sentry/vite-plugin` | `vite.config.js` |
| Webpack | `@sentry/webpack-plugin` | `webpack.config.js` |
| Rollup | `@sentry/rollup-plugin` | `rollup.config.js` |
| esbuild | `@sentry/esbuild-plugin` | esbuild config |

### Plugin options (common across all)

| Option | Required | Purpose |
|--------|----------|---------|
| `org` | Yes | Sentry organization slug |
| `project` | Yes | Sentry project slug |
| `authToken` | Yes | Sentry auth token (use env var, never commit) |
| `release` | No | Release name to associate source maps with |
| `sourcemaps.assets` | No | Glob pattern for source files (default: `./dist/**`) |

### CLI essentials

```bash
npx @sentry/wizard@latest -i sourcemaps          # guided setup
sentry-cli sourcemaps upload ./dist               # manual upload
sentry-cli releases new <name>                    # create release
sentry-cli sourcemaps upload ./dist --release <name>  # upload with release
```

## Caveats

- **Production builds only**: Source maps must be generated and uploaded during production builds. Dev builds skip this.
- **Upload before errors fire**: Source maps must reach Sentry before the corresponding errors. If errors arrive first, stack traces won't resolve until the next deployment.
- **Debug ID is the default mechanism**: Sentry injects Debug IDs into your bundle output. If you see "Sentry not part of build pipeline", the deployed code is missing Debug IDs — re-run the wizard and verify it's a production build.
- **Never commit `SENTRY_AUTH_TOKEN`** — always pass it as an environment variable.
- **Don't serve `.map` files publicly** unless intentional — they expose original source code. Upload to Sentry instead.
- **Release association matters**: Set the same `release` value in both `Sentry.init()` and your source map upload for reliable matching.
- **Debug ID vs legacy**: The Debug ID method (default) survives URL changes. Legacy URL-matching methods break if asset paths change between builds.
- **Large source maps slow uploads**: Use `"hidden-source-map"` devtool mode or configure upload globs to exclude unnecessary files.

## Composition Hints

- Pair with **sentry-react-core** or **sentry-python-core** — those skills set `release` in `Sentry.init()`, which must match the release used during source map upload.
- For CI/CD pipelines, use the plugin's `release` option keyed to your Git SHA or version tag.
- For monorepos, configure `sourcemaps.assets` globs to only upload the relevant package's output.
