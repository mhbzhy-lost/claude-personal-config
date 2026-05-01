---
name: jest-vitest-react
description: Test React components with @testing-library/react, user-event, and act() — user-centric DOM queries and realistic interaction simulation.
tech_stack: [jest-vitest]
language: [javascript, typescript]
capability: [integration-testing, unit-testing]
version: "user-event@14; React 18+"
collected_at: 2025-01-01
---

# React Component Testing

> Source: https://testing-library.com/docs/react-testing-library/intro/, https://testing-library.com/docs/react-testing-library/api/, https://testing-library.com/docs/user-event/intro, https://react.dev/reference/react/act

## Purpose

Test React components by simulating how real users interact with your app. React Testing Library (RTL) works with actual DOM nodes rather than component instances, so tests remain resilient to implementation changes. Combined with `user-event` for realistic interaction simulation and `act()` for flushing React state updates, this is the standard approach for React component testing with Jest or Vitest.

## When to Use

- Testing React component render output and DOM structure
- Simulating user interactions (clicks, typing, form submissions, keyboard navigation)
- Testing React hooks in isolation via `renderHook`
- Verifying DOM state after asynchronous updates (`waitFor`, `findBy` queries)
- Snapshot testing component output with `asFragment`
- Replacing Enzyme-based tests with user-centric tests
- Any scenario where you want tests that resemble how the software is actually used

## Basic Usage

### Minimal render + query test

```js
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

test('renders a greeting', () => {
  render(<Greeting name="World" />)
  expect(screen.getByText('Hello, World!')).toBeInTheDocument()
})
```

### Interaction test with user-event (v14+ recommended)

```js
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

test('button click triggers callback', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<Button onClick={onClick}>Click me</Button>)

  await user.click(screen.getByRole('button', { name: /click me/i }))
  expect(onClick).toHaveBeenCalledTimes(1)
})
```

### Setup function pattern (preferred for multiple tests)

```js
function setup(jsx) {
  return {
    user: userEvent.setup(),
    ...render(jsx),
  }
}

test('form submission', async () => {
  const { user } = setup(<LoginForm />)
  await user.type(screen.getByLabelText(/email/i), 'test@example.com')
  await user.type(screen.getByLabelText(/password/i), 'secret')
  await user.click(screen.getByRole('button', { name: /login/i }))
  // ...assertions
})
```

### Async DOM assertions with waitFor

```js
import { render, screen, waitFor } from '@testing-library/react'

test('loads and displays user', async () => {
  render(<UserProfile userId={1} />)
  await waitFor(() => {
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
})
```

## Key APIs (Summary)

### render(ui, options?) → RenderResult

Returns an object with query methods bound to `baseElement` (defaults to `document.body`):

| Return Value | Purpose |
|---|---|
| `...queries` | `getByText`, `getByRole`, `getByLabelText`, `queryByTestId`, `findByPlaceholderText`, etc. — all DOM Testing Library queries |
| `container` | Rendered `div` — 🚨 avoid querying with this; use screen queries instead |
| `baseElement` | Root for queries and `debug()` output; defaults to `document.body` |
| `debug()` | `console.log(prettyDOM())` — prefer `screen.debug()` |
| `rerender(ui)` | Re-render with new props |
| `unmount()` | Unmount the component (test cleanup) |
| `asFragment()` | Return `DocumentFragment` for snapshot diffing |

Key `render` options:
- **`wrapper`**: Wrap component in a provider (e.g., Redux `<Provider>`, React Router `<MemoryRouter>`)
- **`container`**: Custom DOM container (e.g., `<table>` for `<tbody>` children)
- **`legacyRoot: true`**: Use `ReactDOM.render` instead of `createRoot` (React 17 compat)
- **`reactStrictMode: true`**: Wrap in `<StrictMode>`

### screen

The recommended way to query — all queries are pre-bound to `document.body`:

```js
import { screen } from '@testing-library/react'

screen.getByRole('button', { name: /submit/i })
screen.getByLabelText(/email/i)
screen.getByText('Welcome')
screen.getByTestId('submit-btn')
screen.queryByText('Not here')  // → null if not found
screen.findByText('Async text') // → Promise, waits up to 1000ms
```

### userEvent.setup() (v14+)

Returns a `user` instance. Always call `setup()` before render. Key methods:

- `user.click(element)` — full click interaction
- `user.dblClick(element)` — double click
- `user.type(element, text)` — types character by character
- `user.clear(element)` — clears input
- `user.selectOptions(element, values)` — select dropdown options
- `user.tab()` — keyboard Tab navigation
- `user.keyboard('{Enter}')` — raw keyboard input
- `user.hover(element)` / `user.unhover(element)`
- `user.paste(element, text)`

### renderHook(callback, options?)

Test hooks in isolation:

```js
const { result, rerender, unmount } = renderHook(
  (props) => useCounter(props),
  { initialProps: { initialCount: 0 } }
)
expect(result.current.count).toBe(0)
rerender({ initialCount: 5 })
```

### act(async fn)

Wrap state updates to flush React's internal queue. Most RTL helpers already wrap in `act()` automatically. Only needed for bare React tests or when manually triggering updates outside RTL helpers.

### cleanup()

Unmounts all rendered trees. Called automatically if your framework provides `afterEach` (Jest/Vitest do).

## Caveats

- **Always prefer `user-event` over `fireEvent`**: `user-event` simulates full interactions with visibility checks and multi-event sequences (focus → keydown → keyup → input). `fireEvent` only dispatches a single DOM event — use it only for interactions not yet covered by `user-event`.
- **Call `userEvent.setup()` before `render()`** and never in `before`/`after` hooks.
- **Avoid `container.querySelector()`**: Use `screen.getBy*` queries. They're more resilient to markup changes and encourage accessible component design.
- **`data-testid` is an escape hatch**: Use only when semantic queries (by role, label, text) don't make sense.
- **Failing to call `cleanup()`** between tests causes memory leaks and non-idempotent tests. Jest/Vitest auto-cleanup handles this; other runners may not.
- **`act()` warning**: If you see "The current testing environment is not configured to support act(…)", set `global.IS_REACT_ACT_ENVIRONMENT = true` in your setup file (RTL sets this automatically).
- **`container.firstChild` with React Fragments** only returns the first child, not the Fragment itself.
- **Prefer `render` over `renderHook`**: A real component test is more readable and robust. Use `renderHook` only for hook libraries.

## Composition Hints

- **Jest/Vitest integration**: RTL is test-runner agnostic. Works identically with Jest or Vitest.
- **Custom render**: Create a `test-utils.tsx` with a custom `render` wrapping your providers (Redux, Router, Theme, etc.) using the `wrapper` option.
- **Matchers**: Install `@testing-library/jest-dom` for `.toBeInTheDocument()`, `.toBeDisabled()`, `.toHaveTextContent()`, `.toBeVisible()`, etc.
- **Async queries**: Use `findBy*` (returns Promise, waits) or `waitFor` for elements that appear asynchronously. Use `waitForElementToBeRemoved` for elements that disappear.
- **Query priority**: `getByRole` > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByTestId` (from RTL recommendations).
