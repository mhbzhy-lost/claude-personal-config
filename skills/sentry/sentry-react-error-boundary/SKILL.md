---
name: sentry-react-error-boundary
description: Use Sentry's ErrorBoundary component and React 19 error hooks to catch rendering errors, display fallback UIs, and tag errors by app section.
tech_stack: [react]
language: javascript
capability: [observability]
version: "Sentry JavaScript SDK unversioned; captureReactException >= 9.8.0"
collected_at: 2025-01-01
---

# Sentry React Error Boundary

> Source: https://docs.sentry.io/platforms/javascript/guides/react/features/error-boundary/, https://docs.sentry.io/platforms/javascript/guides/react/features/

## Purpose

Catch React rendering errors in specific component subtrees, report them to Sentry with full component stack traces, and display graceful fallback UIs — without crashing the entire app. Also covers React 19's native error hooks (`onUncaughtError`, `onCaughtError`, `onRecoverableError`) via `Sentry.reactErrorHandler()`.

## When to Use

- **Any React app** that needs scoped error isolation (sidebar vs. main content)
- **React 19+**: use `reactErrorHandler()` for global reporting + `ErrorBoundary` for per-section fallback UIs
- **React 18 and below**: `ErrorBoundary` is your only tool for both reporting and UI recovery
- Need to **tag errors by app section** for filtering in Sentry (`beforeCapture`)
- Need a **custom class-based error boundary** that still reports component stacks

## Basic Usage

### React 19+ — global hooks + scoped boundaries

```javascript
// main.jsx — global error reporting
import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";

const root = createRoot(document.getElementById("root"), {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
});
root.render(<App />);

// App.jsx — scoped fallback UIs
function App() {
  return (
    <Sentry.ErrorBoundary fallback={<p>Dashboard crashed</p>}>
      <Dashboard />
    </Sentry.ErrorBoundary>
  );
}
```

### Basic ErrorBoundary (all React versions)

```javascript
import * as Sentry from "@sentry/react";

<Sentry.ErrorBoundary fallback={<p>Something went wrong</p>}>
  <Dashboard />
</Sentry.ErrorBoundary>
```

### Fallback as function — access error details + retry

```javascript
<Sentry.ErrorBoundary
  fallback={({ error, componentStack, resetError }) => (
    <div>
      <p>Something went wrong</p>
      <details>
        <pre>{error.toString()}</pre>
        <pre>{componentStack}</pre>
      </details>
      <button onClick={resetError}>Try again</button>
    </div>
  )}
>
  <Dashboard />
</Sentry.ErrorBoundary>
```

### Multiple boundaries with section tagging

```javascript
<div style={{ display: "flex" }}>
  <Sentry.ErrorBoundary
    fallback={<p>Sidebar error</p>}
    beforeCapture={(scope) => scope.setTag("section", "sidebar")}
  >
    <Sidebar />
  </Sentry.ErrorBoundary>
  <Sentry.ErrorBoundary
    fallback={<p>Content error</p>}
    beforeCapture={(scope) => scope.setTag("section", "content")}
  >
    <MainContent />
  </Sentry.ErrorBoundary>
</div>
```

## Key APIs (Summary)

### ErrorBoundary Props

| Prop | Type | Purpose |
|------|------|---------|
| `fallback` | `ReactNode \| ({error, componentStack, resetError}) => ReactNode` | UI shown when error is caught |
| `showDialog` | `boolean` | Show the Sentry User Feedback widget on error |
| `dialogOptions` | `Object` | Customize the feedback widget |
| `onError` | `(error, componentStack) => void` | Side-effect callback (e.g. update state management) |
| `beforeCapture` | `(scope) => void` | Tag/context enrichment before event is sent to Sentry |
| `onMount` | `() => void` | Called on mount |
| `onUnmount` | `() => void` | Called on unmount |

### Key methods

- `Sentry.withErrorBoundary(Component, options)` — HOC wrapper, returns wrapped component
- `Sentry.captureReactException(error, info)` — report from custom `componentDidCatch` (SDK >= 9.8.0)
- `Sentry.reactErrorHandler()` — factory for React 19 `onUncaughtError` / `onCaughtError` / `onRecoverableError`

### Custom class boundary (React mandates class components for error boundaries)

```javascript
import React from "react";
import * as Sentry from "@sentry/react";

class CustomErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) {
    Sentry.captureReactException(error, info);  // SDK >= 9.8.0
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
```

## Caveats

- **Duplicate reports in dev mode**: React rethrows errors caught by boundaries to the global handler in development. Verify behavior with a production build.
- **`CaptureConsole` conflicts**: React logs caught errors to `console.error`. If `CaptureConsole` integration is active, the error may be captured through console instead of the boundary.
- **Component stack missing?** Ensure React 17+, `LinkedErrors` integration is enabled (default), and source maps are configured.
- **Custom boundaries must be class components** — a React limitation, not Sentry's.
- **`captureReactException` requires SDK >= 9.8.0**.

## Composition Hints

- Use with **sentry-react-core** — `ErrorBoundary` depends on `Sentry.init()` having been called.
- Use `beforeCapture` + `scope.setTag("section", "...")` to group errors by feature area in Sentry.
- For React 19, combine `reactErrorHandler()` (global catch-all) with multiple `ErrorBoundary` instances (scoped recovery).
