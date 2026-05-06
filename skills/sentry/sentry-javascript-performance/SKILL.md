---
name: sentry-javascript-performance
description: Performance monitoring and distributed tracing for React/JavaScript apps with Sentry — browserTracingIntegration, custom spans, and trace propagation
tech_stack: [sentry]
language: [javascript, typescript]
capability: [observability]
version: "Sentry React SDK v10.x"
collected_at: 2025-01-01
---

# Sentry JavaScript/React Performance & Tracing

> Source: https://docs.sentry.io/platforms/javascript/guides/react/tracing/, https://docs.sentry.io/platforms/javascript/guides/react/tracing/distributed-tracing/, https://docs.sentry.io/platforms/javascript/guides/react/tracing/instrumentation/

## Purpose

Enable performance monitoring and distributed tracing in React (and browser JavaScript) applications using the Sentry SDK. Covers automatic instrumentation via `browserTracingIntegration`, custom span creation, trace propagation across services, sampling control, and Session Replay correlation.

## When to Use

- You need **page-load and navigation performance** tracking in a React SPA
- You run a **distributed system** (frontend → backend → microservices) and need end-to-end trace visibility
- You want **custom instrumentation** for specific functions, API calls, or user flows beyond what automatic tracing covers
- You need to **correlate performance data with user sessions** via Session Replay
- You're debugging **cross-service latency** and need to follow requests across service boundaries

## Basic Usage

```javascript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "___PUBLIC_DSN___",
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
  // 100% tracing for dev; reduce in production or use tracesSampler
  tracesSampleRate: 1.0,
  // Propagate trace headers to these destinations
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
});
```

After init, `browserTracingIntegration` automatically captures `pageload` and `navigation` spans, and propagates `sentry-trace` + `baggage` headers to matching outgoing requests.

## Key APIs (Summary)

### Configuration Options

| Option | Role |
|--------|------|
| `tracesSampleRate` | Uniform 0–1 sample rate for all transactions |
| `tracesSampler` | Function for per-transaction sampling; overrides `tracesSampleRate` |
| `tracePropagationTargets` | String/RegExp array — URLs that receive `sentry-trace` + `baggage` headers |
| `parentSpanIsAlwaysRootSpan` | `true` (default) = flat hierarchy; `false` = nested (risky with parallel async) |
| `beforeSendSpan` | Callback to mutate span data before sending |

### Span Creation

| Function | Behavior |
|----------|----------|
| `Sentry.startSpan(opts, cb)` | Active span, auto-ends when callback resolves. **Use this 90% of the time.** |
| `Sentry.startSpanManual(opts, cb)` | Active span, you call `span.end()` manually. Good for event-driven endings. |
| `Sentry.startInactiveSpan(opts)` | Inactive span, no auto-parenting, manual `span.end()`. |

### Span Utilities

| Function | Purpose |
|----------|---------|
| `Sentry.getActiveSpan()` | Returns the currently active span (or undefined) |
| `Sentry.setActiveSpanInBrowser(span)` | Promote an inactive span to active (browser-only, v10.15.0+) |
| `Sentry.updateSpanName(span, name)` | Rename a span safely (v8.47.0+) |
| `Sentry.getTraceData()` | Returns `{ "sentry-trace", "baggage" }` for manual propagation |
| `span.setAttribute(k, v)` / `span.setAttributes(obj)` | Attach metadata |
| `span.setStatus({ code })` | `0` unknown, `1` ok, `2` error |

### Custom Span (Async) — canonical pattern

```javascript
const result = await Sentry.startSpan(
  { name: "fetchUserData", op: "http.client" },
  async () => {
    const user = await fetch("/api/user");
    return user.json();
  }
);
```

### Manual Trace Propagation (WebSocket, etc.)

```javascript
const { "sentry-trace": sentryTrace, baggage } = Sentry.getTraceData();
webSocket.send(JSON.stringify({
  payload,
  _sentry: { sentryTrace, baggage },
}));
```

## Caveats

- **`tracesSampleRate: 0` does NOT disable tracing.** To fully disable, omit both `tracesSampleRate` and `tracesSampler` entirely.
- **`tracesSampleRate` and `tracesSampler` are mutually exclusive.** If both are set, `tracesSampler` wins.
- **Port numbers count** in `tracePropagationTargets`. An origin `http://localhost:3000` will NOT match `localhost` alone — include the full origin.
- **CORS**: `sentry-trace` and `baggage` headers must be in your CORS allowlist. Proxies/gateways must not strip them.
- **Flat span hierarchy by default.** With `parentSpanIsAlwaysRootSpan: true` (default), all spans are siblings under the root. Setting it to `false` gives nested spans but produces wrong parentage when parallel async operations run concurrently.
- **`setActiveSpanInBrowser` is browser-only.** Guard with `typeof window !== 'undefined'` in SSR/Next.js code.
- **Use `Sentry.updateSpanName()` not `span.updateName()`** in Node.js environments (v8.47.0+) — the latter can be overwritten by automatic naming. In browser SDKs both are equivalent.
- **Distributed tracing requires Sentry on every service** in the call chain, each with its own SDK.

## Composition Hints

- **Pair with `sentry-react-core`** — this skill assumes the SDK is already initialized; core covers `Sentry.init()`, DSN, release/environment setup.
- **Pair with `sentry-react-error-boundary`** — errors captured by ErrorBoundary are automatically linked to the active transaction/span.
- **Pair with `sentry-python-performance`** or `sentry-python-fastapi` — to trace requests end-to-end from a React frontend through Python backend services. Ensure `tracePropagationTargets` includes the backend origin.
- **Pair with `sentry-javascript-sourcemaps`** — source maps resolve minified stack traces in performance profiles.
- **For React Router users** — use the dedicated React Router integration (see Sentry docs) instead of plain `browserTracingIntegration` for route-aware transaction naming.
