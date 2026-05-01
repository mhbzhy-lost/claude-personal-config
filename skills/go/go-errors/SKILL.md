---
name: go-errors
description: Go error wrapping, inspection, and sentinel patterns — errors.Is, errors.As, fmt.Errorf %w, errors.Join, custom error types
tech_stack: [backend]
language: [go]
capability: [api-design, observability]
version: "go1.26.2"
collected_at: 2026-04-07
---

# Go errors — Error Wrapping & Inspection

> Source: https://pkg.go.dev/errors, https://go.dev/blog/go1.13-errors

## Purpose

Package `errors` provides functions to create, wrap, unwrap, and inspect errors. Since Go 1.13, it defines the standard error-wrapping convention (`Unwrap() error`) and two tree-walking functions (`Is` and `As`) that traverse the error chain. Go 1.20 added `Join` for multi-error aggregation, and Go 1.26 added the generic `AsType`.

## When to Use

- **Always** use `errors.Is` instead of `==` when comparing errors that may be wrapped.
- **Always** use `errors.As` (or `AsType`) instead of type assertions when extracting typed errors from a chain.
- Use `fmt.Errorf("...: %w", err)` to wrap an error while preserving it for inspection.
- Use `fmt.Errorf("...: %v", err)` to add context **without** exposing the underlying error (hides implementation details).
- Use `errors.Join` to combine multiple independent errors into one.

## Basic Usage

### Sentinel errors

```go
var ErrNotFound = errors.New("not found")

func FetchItem(name string) (*Item, error) {
    if itemNotFound(name) {
        return nil, fmt.Errorf("%q: %w", name, ErrNotFound)
    }
    // ...
}

// Caller:
if errors.Is(err, ErrNotFound) {
    // handle not-found case
}
```

### Wrapping with context

```go
func readConfig(path string) ([]byte, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("readConfig %s: %w", path, err)
    }
    return data, nil
}
```

### Inspecting the chain

```go
// Sentinel matching — walks the full chain
if errors.Is(err, fs.ErrNotExist) {
    fmt.Println("file does not exist")
}

// Type extraction — walks the full chain
var pathErr *fs.PathError
if errors.As(err, &pathErr) {
    fmt.Println("failed at path:", pathErr.Path)
}

// Go 1.26+ generic form (no pointer-to-pointer)
if pathErr, ok := errors.AsType[*fs.PathError](err); ok {
    fmt.Println("failed at path:", pathErr.Path)
}
```

### Custom error types with Unwrap

```go
type QueryError struct {
    Query string
    Err   error
}

func (e *QueryError) Error() string { return e.Query + ": " + e.Err.Error() }
func (e *QueryError) Unwrap() error { return e.Err }
```

### Custom Is / As methods

```go
func (e *QueryError) Is(target error) bool {
    t, ok := target.(*QueryError)
    if !ok { return false }
    return (e.Query == t.Query || t.Query == "")
}

func (e *QueryError) As(target any) bool {
    // custom type-matching logic
}
```

### Multi-error aggregation (Go 1.20+)

```go
err := errors.Join(err1, err2, err3)
fmt.Println(err) // "err1\nerr2\nerr3"
errors.Is(err, err1) // true
errors.Is(err, err2) // true
```

## Key APIs (Summary)

| Function | Since | Purpose |
|---|---|---|
| `New(text)` | Go 1.0 | Create a simple error (each call returns a distinct value) |
| `fmt.Errorf("...: %w", err)` | Go 1.13 | Wrap an error with additional context |
| `Unwrap(err)` | Go 1.13 | Return the immediately wrapped error (single level, `Unwrap() error` only) |
| `Is(err, target)` | Go 1.13 | Walk the error tree; return true if any error `== target` or has `Is(target) == true` |
| `As(err, &target)` | Go 1.13 | Walk the error tree; set target to first matching typed error |
| `AsType[E](err)` | Go 1.26 | Generic form of As: returns `(E, bool)` — no pointer indirection |
| `Join(errs...)` | Go 1.20 | Combine multiple errors; implements `Unwrap() []error` |

Sentinel variable: `ErrUnsupported` — standard "unsupported operation" error.

## Caveats

- **`%w` makes the wrapped error part of your public API.** Callers can and will depend on it via `errors.Is`/`errors.As`. Don't wrap errors whose types you may change in the future.
- **Use `%v` to hide implementation details.** When repackaging errors from another package whose internals you don't want to expose, use `fmt.Errorf("...: %v", err)` instead of `%w`.
- **Always wrap sentinel errors; never return them directly.** Return `fmt.Errorf("%w", ErrPermission)` instead of `ErrPermission` so callers use `errors.Is` and you retain flexibility to add context later.
- **`errors.Is` defaults to `==` comparison** — sentinel errors must be comparable pointer values. Each `errors.New` call produces a distinct error; re-use a package-level `var` for sentinels.
- **`Unwrap` only handles `Unwrap() error`**, not `Unwrap() []error`. Use `Is`/`As` to inspect `Join`-ed errors.
- **An `Is` method must only shallowly compare** — do not call `Unwrap` on either argument.
- **`errors.As` panics** if target is not a non-nil pointer to an error type or interface.
- **Prefer `AsType` in Go 1.26+** — it eliminates the `var e *SomeErr` + `&e` ceremony and is type-safe.

## Composition Hints

- **Define sentinel errors at package level** for conditions callers need to check: `var ErrNotFound = errors.New("not found")`.
- **Wrap at API boundaries, handle once.** Each layer adds context; the top-level handler decides what to do.
- **For custom error types, always implement `Unwrap()`** if you embed another error. Optionally implement `Is()` for field-aware matching and `As()` for custom type coercion.
- **Use `errors.Join` for "continue on error" workflows** (e.g., validation that collects all failures) rather than returning on the first error.
- **Document which sentinel errors / types your functions return** so callers know what to check with `Is`/`As`.
