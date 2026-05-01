---
name: react-strict-mode
description: Enable React StrictMode to detect impure renders, missing Effect/ref cleanups, and deprecated APIs during development.
tech_stack: [react]
language: [jsx, typescript]
capability: [state-management]
version: "React 18/19"
collected_at: 2025-01-01
---

# React StrictMode

> Source: https://react.dev/reference/react/StrictMode

## Purpose

`<StrictMode>` is a development-only wrapper that enables extra runtime checks to catch common bugs early. It renders no DOM element — it only activates additional behaviors for its children.

Strict Mode performs four checks (all **development-only**, stripped from production):

1. **Double rendering** — catches impure component functions
2. **Double Effect setup+cleanup** — catches missing Effect cleanup
3. **Double ref callback invocation** — catches missing ref cleanup
4. **Deprecated API warnings** — string refs, legacy context, findDOMNode, etc.

## When to Use

- **Always** for new apps: wrap the entire root component tree.
- **Selectively** for existing codebases: wrap only the subtree you're hardening.
- When migrating React 17→18: the new double-mount check for Effects surfaces hidden cleanup bugs.
- When diagnosing intermittent production bugs that look like stale state or leaked subscriptions.

## Basic Usage

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Full app — recommended
const root = createRoot(document.getElementById('root'));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Partial subtree
function App() {
  return (
    <>
      <Header />
      <StrictMode>
        <main>
          <Sidebar />
          <Content />
        </main>
      </StrictMode>
      <Footer />
    </>
  );
}
```

`<StrictMode>` accepts **no props**. There is **no way to opt out** of a subtree once wrapped.

## Key APIs (Summary)

| Concept | Behavior |
|---|---|
| `<StrictMode>` wrapper | Enables dev checks for all descendants |
| Double render | Calls function body, `useState` init, `useMemo`, `useReducer`, class `constructor`/`render`/`shouldComponentUpdate` twice |
| Double Effect cycle | Runs `setup → cleanup → setup` instead of just `setup` on mount |
| Double ref callback | Runs `setup → cleanup → setup` for every callback ref on mount |
| Partial StrictMode | When not at root, does NOT double-fire Effects on initial mount |

## Caveats

- **No opt-out.** Every component inside `<StrictMode>` is checked. If two teams disagree, move `<StrictMode>` down the tree or reach consensus.
- **Partial StrictMode is weaker.** Effects only double-fire on re-mounts, not initial mount, when `<StrictMode>` isn't at the root.
- **Console noise is normal.** Double renders produce dimmed logs in React DevTools. DevTools can suppress the second render's logs entirely.
- **React 18 change:** The Effect double-mount cycle (`mount → unmount → mount`) was added in 18. Before 18, Strict Mode only double-rendered. This is the most common upgrade surprise.
- **React 19 additions:** Deprecated API checks became more aggressive (string refs, legacy context, findDOMNode now trigger warnings or errors).
- **Not a linter substitute.** Strict Mode catches runtime impurity, not static problems. Use it alongside ESLint rules (e.g., `react-hooks/rules-of-hooks`).

## Composition Hints

- **Always wrap root** with `<StrictMode>` in new projects — there's no runtime cost in production.
- **If your app breaks after upgrading to React 18**, temporarily remove `<StrictMode>` to isolate the issue, then fix the revealed bugs (usually missing Effect cleanups) and re-enable.
- **Combine with `<Suspense>`** — React 19 Strict Mode double-invokes ref callbacks on initial mount to simulate what happens when a Suspense fallback replaces mounted content. If your refs survive Strict Mode, they survive Suspense.
- **Testing:** In unit tests, Strict Mode double-behaviors don't run by default from most test renderers. For integration tests using `createRoot`, the double cycle will fire — account for it in assertion counts.
