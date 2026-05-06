---
name: sentry-react-core
description: Initialize and configure Sentry in client-side React SPAs — DSN setup, instrument.js pattern, React 19 error hooks, integrations, releases, and tunneling.
tech_stack: [react]
language: javascript
capability: [observability]
version: "Sentry JavaScript SDK unversioned"
collected_at: 2025-01-01
---

# Sentry React Core

> Source: https://docs.sentry.io/platforms/javascript/guides/react/, https://docs.sentry.io/platforms/javascript/guides/react/configuration/, https://docs.sentry.io/platforms/javascript/guides/react/configuration/releases/

## Purpose

Initialize and configure `@sentry/react` for client-side React SPAs. Covers DSN setup, the mandatory `instrument.js` bootstrap pattern, React 19 error hooks (`reactErrorHandler`), key integrations (tracing, replay, feedback), release/environment binding, Redux integration, and ad-blocker tunneling.

## When to Use

- Any client-side React SPA (Vite, Webpack, custom bundler)
- Need error monitoring + tracing + session replay in a React app
- React 19+ apps wanting root-level error capture via `onUncaughtError`/`onCaughtError`

Do **not** use for Next.js, Remix, Gatsby — those have dedicated SDKs with SSR support.

## Basic Usage

### 1. Install

```bash
npm install @sentry/react --save
```

### 2. Create `instrument.js` (must import FIRST in your entry point)

```javascript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "___PUBLIC_DSN___",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: [/^\//, /^https:\/\/yourserver\.io\/api/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

### 3. Bootstrap in entry point

```javascript
// instrument.js MUST be the very first import
import "./instrument";
import App from "./App";
import { createRoot } from "react-dom/client";

const container = document.getElementById("app");
const root = createRoot(container);
root.render(<App />);
```

### 4. React 19+ error hooks (global error reporting)

```javascript
import "./instrument";
import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";

const root = createRoot(document.getElementById("app"), {
  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
    console.warn("Uncaught error", error, errorInfo.componentStack);
  }),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
});
root.render(<App />);
```

### 5. React 18 and below — use ErrorBoundary

```javascript
import * as Sentry from "@sentry/react";
<Sentry.ErrorBoundary fallback={<p>An error has occurred</p>}>
  <YourApp />
</Sentry.ErrorBoundary>
```

## Key APIs (Summary)

### Core `Sentry.init()` options

| Option | Purpose |
|--------|---------|
| `dsn` | Project DSN (required) |
| `release` | Release version, e.g. `"my-app@2.3.12"` |
| `environment` | `"production"`, `"staging"`, etc. |
| `tracesSampleRate` | 0.0–1.0, fraction of transactions captured |
| `tracesSampler` | Function for per-transaction sampling decisions |
| `tracePropagationTargets` | URL regexes for `sentry-trace` header propagation |
| `replaysSessionSampleRate` | Fraction of sessions recorded |
| `replaysOnErrorSampleRate` | Replay rate for errored sessions |
| `sendDefaultPii` | Send user IP and headers |
| `debug` | Log SDK activity to console |
| `tunnel` | Proxy events through `/tunnel` to evade ad blockers |
| `enableLogs` | Capture structured logs via `Sentry.logger` |
| `integrations` | Array of integrations or filter function |

### Key integrations

- `Sentry.browserTracingIntegration()` — automatic page-load/navigation tracing
- `Sentry.replayIntegration()` — Session Replay recording
- `Sentry.feedbackIntegration({colorScheme: "system"})` — user feedback widget
- `Sentry.reactRouterV7BrowserTracingIntegration({...})` — React Router v7 instrumentation

### Key runtime methods

- `Sentry.captureException(error)` — manually report an exception
- `Sentry.captureMessage("msg")` — manually report a message
- `Sentry.startSpan({op, name}, callback)` — wrap code in a custom span
- `Sentry.reactErrorHandler()` — factory for React 19 error hook callbacks
- `Sentry.logger.info/warn/error(msg, data)` — structured log emission

## Caveats

- **`instrument.js` MUST be the first import** in your entry point, before React or any app code. Otherwise events may be missed.
- **Browser console errors are sandboxed** — errors thrown from DevTools won't reach Sentry. Use an in-app test button to verify.
- **Ad blockers can drop Sentry requests** — use `tunnel: "/tunnel"` to route traffic through your own origin.
- **Source maps are essential** for readable production stack traces — run `npx @sentry/wizard@latest -i sourcemaps`.
- **Release naming convention**: `"project-name@version"`. Pre-register releases in Sentry to unlock commit-tracking and deployment notifications.
- **Session lifecycle**: New session on every page load; for SPAs, new session on every `History API` navigation change. Sessions are auto-managed by `BrowserSession` integration.

## Composition Hints

- Pair with **sentry-react-error-boundary** for scoped fallback UIs in complex component trees.
- Pair with **sentry-javascript-sourcemaps** to ensure production stack traces are readable.
- For Redux apps, use `Sentry.createReduxEnhancer()` and compose with existing enhancers.
- For React Router apps, use the matching `reactRouterV6BrowserTracingIntegration` or `reactRouterV7BrowserTracingIntegration` instead of the generic `browserTracingIntegration`.
