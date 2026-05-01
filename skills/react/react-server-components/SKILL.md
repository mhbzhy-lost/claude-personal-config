---
name: react-server-components
description: React Server Components directives and Server Functions — 'use client' / 'use server' boundaries, Server Actions for mutations, form integration with useActionState, and progressive enhancement.
tech_stack: [react]
language: [javascript]
capability: [api-design, form-validation, web-framework]
version: "React 19"
collected_at: 2025-01-01
---

# React Server Components — Directives & Server Functions

> Source: https://react.dev/reference/rsc/directives, https://react.dev/reference/rsc/server-functions

## Purpose

React Server Components (RSC) directives mark the boundary between server-only and client code. Server Functions (formerly "Server Actions") let Client Components invoke async server-side functions directly — no manual API routes needed for mutations, form submissions, or database writes.

## When to Use

- **Mutations from client:** Create, update, or delete server-side data without building REST/GraphQL endpoints.
- **Form handling:** Pass a Server Function to a `<form action>` for automatic submission, pending state, and form reset.
- **Client-server boundary marking:** Use `'use client'` to mark interactive components; use `'use server'` to expose server-only logic.
- **Progressive enhancement:** Forms work before JavaScript loads when using `useActionState` with a `permalink`.

Requires a framework/bundler that supports RSC (Next.js App Router, etc.). Not usable with vanilla React alone.

## Basic Usage

### Marking the client boundary

```jsx
"use client";

import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

`'use client'` tells the bundler this file (and its imports) run on the client. Without it, components are Server Components by default — they render once on the server and cannot use hooks, event handlers, or browser APIs.

### Defining a Server Function (file-level)

```jsx
"use server";

export async function createNote(title: string) {
  await db.notes.create({ title });
}
```

All exports from a `"use server"` file become callable from Client Components. React sends a POST request to execute the function and returns the result.

### Defining a Server Function inside a Server Component

```jsx
// Server Component (no 'use client' directive)
import Button from './Button';

function EmptyNote() {
  async function createNoteAction() {
    'use server';
    await db.notes.create();
  }

  return <Button onClick={createNoteAction} />;
}
```

React creates a reference (`$$typeof: Symbol.for("react.server.reference")`) and passes it to the Client Component. The Button calls the reference, React sends the request to the server.

### Calling a Server Function from a Client Component

```jsx
"use client";
import { createNote } from './actions';

function NewNoteButton() {
  return <button onClick={() => createNote()}>Create Note</button>;
}
```

### Form actions with Server Functions

```jsx
"use client";
import { updateName } from './actions';

function UpdateName() {
  return (
    <form action={updateName}>
      <input type="text" name="name" />
    </form>
  );
}
```

React automatically resets the form on success. Use `useActionState` for pending state and return values.

## Key APIs (Summary)

| API | Role |
|-----|------|
| `"use client"` | File-level directive: marks module as client-side code |
| `"use server"` | File or function-level directive: exposes server-side logic to client |
| `useActionState(fn, initialState, permalink?)` | Wraps a Server Function for forms; returns `[state, submitAction, isPending]` |
| `useTransition()` | Wraps Server Function calls for `isPending` state in non-form scenarios |

### useActionState signature

```jsx
const [state, submitAction, isPending] = useActionState(
  serverFunction,  // Server Function to call
  initialState,    // Initial state value
  '/fallback-url'  // optional permalink for progressive enhancement
);
```

- `state`: The value returned from the Server Function (updated on completion).
- `submitAction`: A wrapped version of the Server Function to pass to `<form action>`.
- `isPending`: `true` while the Server Function is executing.
- **Pre-hydration replay:** Form submissions before JS loads are replayed automatically.
- **Progressive enhancement:** With `permalink`, React redirects to that URL if JS hasn't loaded yet.

### Form example with useActionState

```jsx
"use client";
import { useActionState } from 'react';
import { updateName } from './actions';

function UpdateName() {
  const [state, submitAction, isPending] = useActionState(updateName, { error: null });

  return (
    <form action={submitAction}>
      <input type="text" name="name" disabled={isPending} />
      {state.error && <span>Failed: {state.error}</span>}
    </form>
  );
}
```

### Non-form example with useTransition

```jsx
"use client";
import { useState, useTransition } from 'react';
import { updateName } from './actions';

function UpdateName() {
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await updateName(name);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div>
      <button onClick={handleSubmit} disabled={isPending}>Save</button>
      {error && <span>Error: {error}</span>}
    </div>
  );
}
```

## Caveats

### Framework required
Server Functions need a bundler/framework with RSC support. The underlying bundler APIs are **not semver-stable** across React 19.x minors — pin your React version.

### Naming: Server Functions vs Server Actions
"Server Functions" is the umbrella term (since September 2024). "Server Action" specifically means a Server Function passed to an `action` prop or called from inside an action context.

### Serialization boundary
Props from Server Components to Client Components must be serializable. Server Function references (the `$$typeof: Symbol.for("react.server.reference")` objects) are handled automatically by the framework.

### Return values, not thrown errors
Return error objects from Server Functions rather than throwing:

```jsx
"use server";
export async function updateName(name) {
  if (!name) return { error: 'Name is required' };
  await db.users.updateName(name);
}
```

### `'use server'` placement rules
- **File-level:** `"use server";` at the top — all exports become Server Functions.
- **Function-level:** `'use server';` inside an async function in a Server Component — only that function becomes a Server Function. Must be async.

### Progressive enhancement needs permalink
Without the third argument to `useActionState`, forms don't work before JS hydration. Provide a `permalink` for full progressive enhancement.

## Composition Hints

- **Keep Server Functions in dedicated files** (`app/actions.ts`) for reuse across Client Components.
- **Use `useActionState` for forms** — it handles `isPending`, return values, and pre-hydration replay in one hook.
- **Use `useTransition` for non-form Server Function calls** when you need `isPending` for custom UI (e.g., button loading state outside a `<form>`).
- **Validate in Server Functions, not just on the client** — return error objects; the client displays them.
- **`'use client'` at the leaf level:** Push the client boundary as deep as possible. Server Components are the default; only add `"use client"` when you need interactivity.
- **Don't mix `'use server'` and `'use client'` in the same file.** A file is either server or client — Server Functions must be imported into Client Components.
