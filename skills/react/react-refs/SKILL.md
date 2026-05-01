---
name: react-refs
description: Forward refs to DOM nodes and expose constrained imperative handles with useImperativeHandle.
tech_stack: [react]
capability: [ui-input]
version: "React 19"
collected_at: 2025-01-01
---

# React Refs & DOM Manipulation

> Source: https://react.dev/reference/react/forwardRef, https://react.dev/reference/react/useImperativeHandle

## Purpose

Refs provide an escape hatch for imperative DOM access in React's declarative model. Use `ref` as a prop (React 19) or `forwardRef` (React 18) to let parent components interact with a child's DOM node. Use `useImperativeHandle` to expose only a curated set of methods instead of the raw DOM node, preserving encapsulation.

## When to Use

- **Focus management**: programmatically focusing an input, moving focus between fields.
- **Scroll control**: scrolling to a specific element, scroll-to-bottom in chat.
- **Animation triggers**: starting/stopping animations imperatively.
- **Media control**: play, pause, seek on video/audio elements.
- **Text selection**: selecting or clearing text ranges.
- **Third-party library integration**: handing a DOM node to a non-React widget (map, chart, editor).

**Do NOT use refs** when the behavior can be expressed declaratively via props. For example, use `<Modal isOpen={isOpen} />` instead of exposing `{ open, close }` on a ref.

## Basic Usage

### React 19: ref as a prop (recommended)

```jsx
// Child: receive ref as a regular prop, forward it to a DOM node
function MyInput({ label, ref, ...rest }) {
  return (
    <label>
      {label}
      <input ref={ref} {...rest} />
    </label>
  );
}

// Parent: pass a ref like any other prop
function Form() {
  const inputRef = useRef(null);
  return (
    <>
      <MyInput label="Name" ref={inputRef} />
      <button onClick={() => inputRef.current.focus()}>Edit</button>
    </>
  );
}
```

### React 18: forwardRef (legacy)

```jsx
import { forwardRef } from 'react';

const MyInput = forwardRef(function MyInput({ label, ...rest }, ref) {
  return (
    <label>
      {label}
      <input ref={ref} {...rest} />
    </label>
  );
});
```

### useImperativeHandle: constrained imperative handle

```jsx
import { useRef, useImperativeHandle } from 'react';

function MyInput({ ref }) {
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current.focus();
    },
    scrollIntoView() {
      inputRef.current.scrollIntoView();
    },
  }), []); // stable dependencies — recreate only when needed

  return <input ref={inputRef} />;
}

// Parent receives { focus, scrollIntoView } — not the raw <input>
function Form() {
  const ref = useRef(null);
  return <MyInput ref={ref} />;
  // ref.current.focus() works, but ref.current.style is inaccessible
}
```

## Key APIs (Summary)

| API | Signature | Notes |
|-----|-----------|-------|
| `ref` prop (React 19) | Pass `ref` as a regular prop | Replaces `forwardRef`. No wrapper needed. |
| `forwardRef` (legacy) | `forwardRef((props, ref) => JSX)` | Still works in 19 but deprecated. |
| `useImperativeHandle` | `useImperativeHandle(ref, () => handle, deps?)` | Customizes what the parent sees on `ref.current`. Omitting `deps` re-executes every render. |

## Caveats

### Ref is null? Two common causes

1. **Forgot to pass the ref down to a DOM node**. The component receives `ref` as a prop but never attaches it to anything.
2. **Conditional rendering hides the target**. When `ref` is on a conditionally rendered element (`showInput && <input ref={ref} />`) and the condition is false, the ref stays `null`. This is especially easy to miss when the condition lives inside a child component wrapper.

### Don't overuse refs

Refs are for imperative behaviors that have no declarative equivalent: focusing, scrolling, animation, selection. If you find yourself writing `ref.current.open()` and `ref.current.close()`, refactor to `<Modal isOpen={isOpen} />` with a prop instead.

### Encapsulation: expose DOM nodes sparingly

Expose raw DOM nodes only from low-level reusable components (buttons, inputs, sliders). Application-level components (avatars, comment threads, cards) should not leak their DOM. This keeps internal refactoring safe — you can swap `<input>` for a `<div contentEditable>` without breaking callers.

### Strict Mode double invocation

In development Strict Mode, `forwardRef` render functions fire twice. `useImperativeHandle`'s `createHandle` also re-executes if dependencies change. Ensure your render and handle-creation logic is pure (no side effects).

### React 19 migration path

Replace `forwardRef(Component)` with a plain function that destructures `ref` from props. No other changes required. The old pattern still works but emits a deprecation warning.

## Composition Hints

- **Forward through multiple layers**: each intermediate component just passes `ref` to the next — no special handling needed in React 19.
- **Combine with `useImperativeHandle`**: store the real DOM ref internally (`useRef`), forward a curated API through `useImperativeHandle`. This is the standard pattern for reusable component libraries.
- **Callback refs** (React 19): you can pass a function as `ref`. React 19 adds cleanup support — return a cleanup function from the callback ref.
- **Refs + Effects**: use `useEffect` to react to a ref being populated (e.g., measure DOM, initialize a third-party widget). The ref is guaranteed to be set when the effect runs after mount.
