---
name: react-upgrade-migration
description: Step-by-step migration guide for upgrading React through versions 17→18→19, covering breaking changes, removed APIs, codemods, and bridge strategies.
tech_stack: [react]
language: [jsx, typescript, bash]
capability: [state-management, unit-testing]
version: "React 17 → 18 → 19"
collected_at: 2025-01-01
---

# React Upgrade & Migration

> Sources: https://react.dev/blog/2024/04/25/react-19-upgrade-guide, https://react.dev/blog/2022/03/08/react-18-upgrade-guide

## Purpose

A practical migration guide covering every breaking change when moving between React 17, 18, and 19. Includes the required API replacements, codemod commands, and the 18.3 bridge strategy.

## When to Use

- Planning a React version upgrade and need a checklist of all breaking changes.
- Diagnosing why an app broke after upgrading React.
- Preparing a legacy codebase (string refs, legacy context, PropTypes) for React 19.
- Setting up a new project and need to ensure no deprecated patterns are used.

## Basic Usage

### Recommended upgrade path

```bash
# 1. Bridge to React 18.3 (surfaces all 19 deprecation warnings)
npm install react@^18.3.0 react-dom@^18.3.0

# 2. Fix all warnings in the console

# 3. Run automated codemods
npx codemod@latest react/19/migration-recipe ./src

# 4. Run TypeScript codemods
npx types-react-codemod@latest preset-19 ./src

# 5. Install React 19
npm install --save-exact react@^19.0.0 react-dom@^19.0.0
```

### Quick reference: React 17 → 18

| Old (17) | New (18+) |
|---|---|
| `ReactDOM.render(<App/>, el)` | `createRoot(el).render(<App/>)` from `react-dom/client` |
| `ReactDOM.hydrate(<App/>, el)` | `hydrateRoot(el, <App/>)` from `react-dom/client` |
| `unmountComponentAtNode(el)` | `root.unmount()` |
| `render(<App/>, el, callback)` | `useEffect` for post-render logic |
| Manual batching (only React events) | Automatic batching everywhere; `flushSync` to opt out |
| `renderToNodeStream` | `renderToPipeableStream` / `renderToReadableStream` |

### Quick reference: React 18 → 19 — Removed APIs

| Removed | Replacement |
|---|---|
| `ReactDOM.render` | `createRoot` from `react-dom/client` |
| `ReactDOM.hydrate` | `hydrateRoot` from `react-dom/client` |
| `ReactDOM.findDOMNode` | `useRef` + `ref` prop |
| `ReactDOM.unmountComponentAtNode` | `root.unmount()` |
| String refs (`ref="x"`) | Callback refs or `createRef` |
| Legacy Context (`contextTypes`/`getChildContext`) | `createContext` + `contextType` |
| `propTypes` on function components | TypeScript interfaces or other type-checker |
| `defaultProps` on function components | ES6 default parameters |
| `React.createFactory` | JSX |
| `react-dom/test-utils` (except `act`) | `@testing-library/react` |
| `act` from `react-dom/test-utils` | `act` from `react` |
| `react-test-renderer/shallow` | `react-shallow-renderer` package |

## Key APIs (Summary)

### createRoot (React 18+)

```jsx
import { createRoot } from 'react-dom/client';
const root = createRoot(document.getElementById('root'));
root.render(<App />);

// React 19: error handling options
const root = createRoot(container, {
  onUncaughtError: (error, errorInfo) => { /* sentry, etc */ },
  onCaughtError: (error, errorInfo) => { /* boundary-caught logging */ },
});
```

### Automatic batching + flushSync (React 18+)

```jsx
// All updates batched — even in setTimeout, promises, native handlers
setTimeout(() => {
  setCount(c => c + 1);
  setFlag(f => !f);
  // React renders ONCE
}, 1000);

// Opt-out when you need synchronous DOM
import { flushSync } from 'react-dom';
flushSync(() => setCount(c => c + 1));
// DOM updated now
```

### Common migration patterns

```jsx
// ── propTypes + defaultProps → TypeScript ──
// Before
Heading.propTypes = { text: PropTypes.string };
Heading.defaultProps = { text: 'Hello' };

// After
interface Props { text?: string; }
function Heading({ text = 'Hello' }: Props) { return <h1>{text}</h1>; }

// ── string refs → callback refs ──
// Before: <input ref='input' />; this.refs.input.focus()
// After:  <input ref={el => this.input = el} />; this.input.focus()

// ── findDOMNode → useRef ──
// Before: findDOMNode(this).select()
// After:  const ref = useRef(null); ref.current.select(); <input ref={ref} />

// ── act import move ──
// Before: import { act } from 'react-dom/test-utils';
// After:  import { act } from 'react';
```

## Caveats

- **18.3 bridge is mandatory practice.** Jumping straight from 18.2 to 19 will surface all breaking changes at once with no warning runway.
- **New JSX transform required for React 19.** If you see "outdated JSX transform" warnings, enable it in your build tool (most have it on by default since 2020).
- **No Internet Explorer in React 18+.** React 18 uses microtasks that can't be polyfilled. Stay on 17 if IE is required.
- **Strict Mode after React 18 upgrade** can appear to break your app. The new double-mount cycle reveals missing Effect cleanups. Remove `<StrictMode>` temporarily, fix bugs, then re-enable.
- **`useRef()` now requires an argument in React 19 types.** Change `useRef()` → `useRef(null)` or `useRef(undefined)`.
- **Ref callbacks must not implicitly return values in React 19.** TypeScript rejects `ref={el => (instance = el)}`. Use block body: `ref={el => { instance = el; }}`.
- **Hydration errors became strict in React 18.** Missing text nodes are errors, not warnings. React reverts to client rendering up to the nearest `<Suspense>` boundary.
- **UMD builds removed in React 19.** CDN users must switch to ESM-based CDN like `esm.sh`.
- **No `setState` on unmounted warning** was removed in React 18. Rely on Effect cleanups instead.
- **Libraries depending on React internals** (`SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED`) will break in React 19. Check third-party deps before upgrading.
