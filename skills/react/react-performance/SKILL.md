---
name: react-performance
description: Measure rendering performance with React Profiler and prevent unnecessary re-renders with React.memo.
tech_stack: [react]
language: [javascript, typescript]
capability: [observability]
version: "React unversioned"
collected_at: 2025-07-16
---

# React Performance

> Source: https://react.dev/reference/react/Profiler, https://react.dev/reference/react/memo

## Purpose

Two built-in React APIs for optimizing render performance: `<Profiler>` measures how long components take to render and how well memoization is working; `React.memo` skips re-rendering a component when its props haven't changed. Together they form the measurement-and-optimization loop for React performance tuning.

## When to Use

### `<Profiler>`
- Identify which parts of the app re-render too often or too slowly
- Measure whether memoization (`memo`, `useMemo`, `useCallback`) is actually reducing render cost — compare `actualDuration` to `baseDuration`
- Audit performance regressions across releases

### `React.memo`
- A component re-renders frequently with the exact same props and its render logic is expensive enough to cause perceptible lag
- Granular interactions (drawing editors, data grids, live charts) benefit most; coarse page-level navigation rarely needs it
- Combine with `useMemo` and `useCallback` when passing objects, arrays, or functions as props

**Don't memoize prematurely** — if there's no measurable lag, `memo` adds complexity without benefit. With React Compiler enabled, manual `memo` is unnecessary.

## Basic Usage

### Measure with `<Profiler>`

```jsx
import { Profiler } from "react";

function onRender(id, phase, actualDuration, baseDuration, startTime, commitTime) {
  console.log(`${id} ${phase}: ${actualDuration}ms (base: ${baseDuration}ms)`);
}

function App() {
  return (
    <Profiler id="Navigation" onRender={onRender}>
      <Navigation />
    </Profiler>
  );
}
```

### Skip re-renders with `memo`

```jsx
import { memo } from "react";

const ExpensiveList = memo(function ExpensiveList({ items }) {
  return items.map(item => <Row key={item.id} {...item} />);
});
// ExpensiveList only re-renders when `items` reference changes
```

### `memo` + `useMemo` for stable object props

```jsx
function Parent() {
  const [filter, setFilter] = useState("");
  const filteredItems = useMemo(
    () => allItems.filter(i => i.name.includes(filter)),
    [filter, allItems]
  );
  return <ExpensiveList items={filteredItems} />;
}
```

### `memo` + `useCallback` for stable function props

```jsx
function Parent() {
  const handleSelect = useCallback((id) => {
    setSelected(id);
  }, []);
  return <ExpensiveList onSelect={handleSelect} />;
}
```

### Custom comparison with `memo`

```jsx
const Chart = memo(ChartImpl, (prev, next) =>
  prev.dataPoints.length === next.dataPoints.length &&
  prev.dataPoints.every((p, i) => p.x === next.dataPoints[i].x && p.y === next.dataPoints[i].y)
);
```

## Key APIs (Summary)

### `<Profiler>` props

| Prop | Purpose |
|------|---------|
| `id` | String label for identifying this profiler in logs |
| `onRender` | `(id, phase, actualDuration, baseDuration, startTime, commitTime) => void` |

### `onRender` parameters

| Param | Meaning |
|-------|---------|
| `phase` | `"mount"` / `"update"` / `"nested-update"` |
| `actualDuration` | Real time spent rendering this subtree (lower is better with memoization) |
| `baseDuration` | Estimated worst-case render time without any memoization |

### `memo(Component, arePropsEqual?)` behavior

A memoized component re-renders only when:
1. Props change (by default, `Object.is` comparison fails)
2. Its own state changes
3. A context it consumes changes

## Caveats

- **`<Profiler>` is disabled in production** — enable a special profiling build for production measurement; adds CPU/memory overhead
- **`memo` is not a guarantee** — React may still re-render for internal reasons; treat it as an optimization only
- **Reference equality kills memoization** — objects/arrays/functions recreated in render create new references every time; use `useMemo`/`useCallback` or restructure to pass primitives
- **Custom `arePropsEqual` must compare every prop including functions** — skipping function comparison causes stale closures
- **Avoid deep equality in custom comparison** — it can freeze the app on large data structures
- **React Compiler replaces `memo`** — when enabled, the compiler auto-memoizes components; manual `React.memo` becomes unnecessary
- **Memoization doesn't stop state/context re-renders** — only props are considered
- **Don't memoize everything** — a single "always new" prop (object/function) breaks memoization for the entire component

## Composition Hints

- Nest `<Profiler>` components to get granular timing: wrap the root with one profiler, and specific subtrees with others
- Use `actualDuration` vs `baseDuration` ratio as a memoization effectiveness score — aim for `actualDuration` close to 0 on re-renders for well-memoized subtrees
- Structure props to avoid breaking memoization: pass primitives or stable references; prefer `children` JSX over prop drilling for wrapper components
- The most impactful performance wins come from **architecture** (colocate state, keep rendering logic pure, avoid unnecessary Effects) — `memo` is the last step, not the first
- For the React DevTools Profiler tab (interactive), use the same `<Profiler>` API under the hood; programmatic usage is for automated tooling and custom dashboards
