---
name: react-error-boundaries
description: Catch JavaScript errors in the React component tree and display fallback UI instead of crashing the whole app.
tech_stack: [react]
language: [javascript, typescript]
capability: [ui-feedback, observability]
version: "react-error-boundary 6.1.1"
collected_at: 2025-07-16
---

# React Error Boundaries

> Source: https://react.dev/reference/react/Component, https://github.com/bvaughn/react-error-boundary

## Purpose

Error Boundaries catch JavaScript errors anywhere in their child component tree during rendering, log those errors, and display a fallback UI instead of crashing the whole app. They are the React-provided mechanism for graceful error handling in the render phase.

## When to Use

- Wrap top-level routes or page components to prevent one crash from taking down the entire app
- Wrap third-party or untrusted components that may throw during render
- Wrap recoverable sections (widgets, comment sections, dashboards)
- Log errors to an error reporting service in production via `onError`
- Retry failed renders via `resetErrorBoundary` or `resetKeys`

**Do NOT use for:**
- Event handler errors — use try/catch inside handlers
- Async errors (`useEffect`, promises) — use `.catch()` or try/catch
- Control flow for expected errors

## Basic Usage

### react-error-boundary (recommended for function components)

```jsx
import { ErrorBoundary } from "react-error-boundary";

function MyApp() {
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <div role="alert">
          <p>Something went wrong:</p>
          <pre>{error.message}</pre>
          <button onClick={resetErrorBoundary}>Try again</button>
        </div>
      )}
      onError={(error, info) => logToService(error, info.componentStack)}
    >
      <ComponentThatMayError />
    </ErrorBoundary>
  );
}
```

### Class component (built-in, no dependency)

```jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert">
          <p>Something went wrong:</p>
          <pre>{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
```

## Key APIs (Summary)

### react-error-boundary `<ErrorBoundary>` props

| Prop | Purpose |
|------|---------|
| `fallback` | Static JSX to show on error |
| `FallbackComponent` | Component receiving `{ error, resetErrorBoundary }` |
| `fallbackRender` | Render-prop `({ error, resetErrorBoundary }) => JSX` |
| `onError(error, info)` | Log error + componentStack to a service |
| `onReset()` | Callback when boundary resets for retry |
| `resetKeys` | Array; when any value changes, the error state resets automatically |

### Class component lifecycle methods

| Method | Purpose |
|--------|---------|
| `static getDerivedStateFromError(error)` | Called on error; return state update to show fallback UI |
| `componentDidCatch(error, info)` | Called after error; use for logging (NOT for `setState` — deprecated) |

## Caveats

- **Error boundaries do NOT catch**: event handlers, async code (`setTimeout`, promises), SSR errors, or errors in the boundary itself
- **Class component only** — there is no React Hook for error boundaries. The `react-error-boundary` package wraps a class so you can use it with function components.
- **`react-error-boundary` v6+ is ESM-only** — use v5 for projects without ESM support
- **`setState` inside `componentDidCatch` is deprecated** — use `static getDerivedStateFromError` to set fallback UI state
- **Dev vs. production**: In dev, caught errors still bubble to `window.onerror`; in production they do not
- **Version mismatch**: `ErrorBoundary cannot be used as a JSX component` — pin `@types/react` to match your `react` version via `overrides` (npm) or `resolutions` (yarn)

## Composition Hints

- Place error boundaries at strategic granularity — wrapping each route or logical section gives the best UX (e.g., sidebar and main content should have separate boundaries)
- Use `resetKeys` when errors correlate with data — changing a user ID or route param resets the boundary automatically
- Pair with `onReset` to clean up any side effects before retrying
- Combine with `Suspense` at a higher level: `Suspense` for loading states, error boundary for error states
- For async errors that error boundaries can't catch, use a custom hook that converts promise rejections into state, then let the error boundary catch the render error
