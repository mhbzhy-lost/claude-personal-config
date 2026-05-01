---
name: react-portals
description: Render React children into a different DOM location while preserving React tree context and event propagation.
tech_stack: [react]
capability: [ui-overlay]
version: "React 19"
collected_at: 2025-01-01
---

# React Portals (createPortal)

> Source: https://react.dev/reference/react-dom/createPortal

## Purpose

`createPortal` teleports JSX into a different DOM node while keeping the React tree intact — context, state, and events all behave as if the content were still in its original position.

## When to Use

- **Modal dialogs** that must escape parent `overflow: hidden` or z-index traps.
- **Tooltips / popovers** that need to visually float above the page without CSS hacks.
- **Integration with non-React markup**: render React into a server-rendered sidebar, footer, or static region without multiple React roots.
- **Third-party widget interop**: inject React content into DOM nodes owned by a map, chart, or editor library.

**Do NOT use portals** as a cheap fix for z-index or CSS stacking issues — fix the stacking context instead.

## Basic Usage

```jsx
import { createPortal } from 'react-dom';

function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-content">
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body
  );
}
```

The modal's DOM lives directly under `<body>`, immune to parent clipping. Yet events bubble to `<Modal>`'s React ancestors and context flows normally.

## Key APIs (Summary)

### `createPortal(children, domNode, key?)`

| Parameter  | Description |
|------------|-------------|
| `children` | Any renderable React content (JSX, Fragment, string, number, arrays) |
| `domNode`  | An **existing** DOM node. Changing it on re-render recreates portal content. |
| `key`      | Optional unique key for reconciliation when multiple portals target the same node. |

Returns a React node that can appear in JSX. React inserts `children` into `domNode`.

## Caveats

### Event propagation follows the React tree, NOT the DOM tree

A click inside a portal fires `onClick` handlers on React ancestors that wrap the `createPortal` call — even though those ancestors' DOM nodes don't contain the portal in the browser. To stop this, call `e.stopPropagation()` inside the portal, or relocate the portal higher in the React tree.

```jsx
<div onClick={() => console.log('This WILL fire on portal clicks!')}>
  {createPortal(<button>Click me</button>, document.body)}
</div>
```

### Target node must pre-exist

The `domNode` argument must reference an existing DOM element. Passing `null` or a detached node will error. For dynamic targets (e.g., widget-created popup containers), conditionally render the portal only when the target is ready.

### Multiple portals to the same node — use keys

When several portals target `document.body`, provide a `key` so React can tell them apart during reconciliation. Without keys, updating one portal can inadvertently recreate others.

### Accessibility for modals

Portals don't automatically manage focus or ARIA. For modal dialogs, you must:
- Trap focus inside the modal while open.
- Restore focus on close.
- Set `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- Handle Escape key and backdrop clicks.

Consider community packages that implement WAI-ARIA Modal Authoring Practices, or build these behaviors manually.

### React 19: no API changes

`createPortal` is unchanged in React 19. It remains in `react-dom`, not `react`.

## Composition Hints

- **Portals compose with Context**: wrap the `createPortal` call in a Provider, and portal children will see it.
- **Portals + Suspense**: a portal can contain its own `<Suspense>` boundary for loading states.
- **Nested portals**: a portal's children can themselves use `createPortal` — each layer's event bubbling and context still follow the React tree.
- **Server rendering note**: portals don't work on the server (`document` doesn't exist). Guard with `typeof document !== 'undefined'` or use a `useEffect` mount gate: render the portal only after hydration.
