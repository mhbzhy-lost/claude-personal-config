---
name: react-useId
description: Generate unique IDs for accessibility attributes that remain stable across server rendering and hydration — the SSR-safe alternative to incrementing counters
tech_stack: [react]
language: [javascript, typescript]
capability: [ui-form, ui-input]
version: "React 19"
collected_at: 2025-01-01
---

# useId

> Source: https://react.dev/reference/react/useId

## Purpose

`useId` generates unique, SSR-safe ID strings for wiring up accessibility attributes (`aria-describedby`, `aria-labelledby`, `htmlFor`, etc.). Its key value proposition over hand-rolled counters is **hydration safety**: the ID derives from the component's position in the React tree ("parent path"), so server and client always agree regardless of rendering order.

## When to Use

**Use `useId` for:**
- Linking labels to inputs via `htmlFor` / `id`
- Connecting ARIA attributes: `aria-describedby`, `aria-labelledby`, `aria-details`
- Any case where a component may render multiple times on a page and needs unique DOM IDs

**Do NOT use `useId` for:**
- **List keys** — keys must come from your data, not from `useId`
- **Cache keys** for `use()` — the ID can change during rendering; derive cache keys from your data
- **Async Server Components** — currently unsupported

## Basic Usage

```js
import { useId } from 'react';

function PasswordField() {
  const passwordHintId = useId();
  return (
    <>
      <label>
        Password:
        <input type="password" aria-describedby={passwordHintId} />
      </label>
      <p id={passwordHintId}>
        The password should contain at least 18 characters
      </p>
    </>
  );
}

// Safe: even with two <PasswordField /> instances, IDs won't clash
function App() {
  return (
    <>
      <h2>Choose password</h2>
      <PasswordField />
      <h2>Confirm password</h2>
      <PasswordField />
    </>
  );
}
```

### Shared prefix for multiple related elements

Call `useId` once and derive suffixes — avoids calling the hook per element:

```js
function Form() {
  const id = useId();
  return (
    <form>
      <label htmlFor={`${id}-firstName`}>First Name:</label>
      <input id={`${id}-firstName`} type="text" />
      <label htmlFor={`${id}-lastName`}>Last Name:</label>
      <input id={`${id}-lastName`} type="text" />
    </form>
  );
}
```

### Multiple React apps on the same page

Pass `identifierPrefix` to `createRoot`/`hydrateRoot` so IDs from different roots never collide:

```js
const root1 = createRoot(document.getElementById('root1'), {
  identifierPrefix: 'app1-'
});
const root2 = createRoot(document.getElementById('root2'), {
  identifierPrefix: 'app2-'
});
```

For SSR, the same prefix must be passed to both the server API (`renderToPipeableStream`) and the client `hydrateRoot` call.

## Key APIs (Summary)

| API | Notes |
|---|---|
| `useId()` | No parameters. Returns a stable unique ID string per call site. |

- The returned ID is stable across re-renders for the same component instance.
- ID format includes a colon (`:`) — safe for CSS selectors and DOM attributes.
- Generated from the calling component's "parent path" in the React tree.

## Caveats

1. **SSR requires identical component trees.** If the server and client render different component structures (e.g., behind a `typeof window` check), the generated IDs won't match, causing hydration warnings or errors.

2. **Not for list keys.** `useId` defeats React's reconciliation — list items need keys derived from the data itself.

3. **Not for `use()` cache keys.** The ID is stable when mounted but may change during rendering. Generate cache keys from your data.

4. **Unavailable in async Server Components.** This is a current React limitation.

5. **Top-level hook only.** Don't call `useId` inside loops, conditions, or nested functions.

## Composition Hints

- **Custom Hook wrapping:** Encapsulate `useId` + related ARIA wiring in a custom hook (e.g., `useAccessibleField(id)` returning `inputProps` and `labelProps`).
- **Component libraries:** Always use `useId` instead of hardcoded IDs in reusable components — callers may render multiple instances.
- **Testing:** `useId` output is deterministic per call site in the tree, so snapshot tests remain stable as long as the component hierarchy doesn't change.
- **Multi-root pages:** Always use `identifierPrefix` when embedding multiple React roots on one HTML page, even if only one uses SSR.
