---
name: go-context
description: Go context 包：WithCancel/WithTimeout/WithDeadline/WithValue 取消传播、超时控制与请求域值传递
tech_stack: [go]
language: [go]
capability: [web-framework, auth, observability]
version: "go1.26.2"
collected_at: 2026-04-07
---

# Go context

> Source: https://pkg.go.dev/context, https://go.dev/blog/context

## Purpose

Package context carries deadlines, cancellation signals, and request-scoped values across API boundaries and goroutines. It is the standard mechanism for lifecycle management in Go servers: every incoming request creates a Context, and every outgoing call accepts one. The chain between them propagates the Context, optionally deriving new ones via `WithCancel`, `WithDeadline`, `WithTimeout`, or `WithValue`.

When a Context is canceled, all Contexts derived from it are also canceled — forming a cancellation tree.

## When to Use

- **Cancellation propagation**: signal all goroutines in a request tree to stop when the request completes or fails.
- **Timeouts/deadlines**: enforce upper bounds on DB queries, HTTP calls, RPCs.
- **Request-scoped values**: carry auth tokens, user identity, trace IDs across API boundaries.
- **Goroutine lifecycle**: coordinate cleanup via `<-ctx.Done()` in `select` statements.
- **NOT for**: passing optional parameters, storing struct fields, general-purpose key-value bags.

## Basic Usage

### Root contexts

```go
ctx := context.Background() // main, init, tests, top-level for incoming requests
ctx := context.TODO()       // placeholder during refactoring — static analysis ignores it
```

### WithCancel — manual cancellation

```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel() // always call cancel to release resources

go func() {
    for {
        select {
        case <-ctx.Done():
            return // goroutine stops cleanly
        default:
            // do work
        }
    }
}()
```

### WithTimeout — duration-based deadline

```go
ctx, cancel := context.WithTimeout(parentCtx, 5*time.Second)
defer cancel() // releases timer resources early if operation completes

resp, err := httpClient.Do(req.WithContext(ctx))
```

### WithDeadline — absolute time deadline

```go
deadline := time.Now().Add(30 * time.Second)
ctx, cancel := context.WithDeadline(context.Background(), deadline)
defer cancel()
```

### WithValue — request-scoped data

```go
// Define an unexported key type to avoid collisions
type contextKey int
const traceIDKey contextKey = 0

// Store
ctx = context.WithValue(ctx, traceIDKey, "abc-123")

// Retrieve
traceID, ok := ctx.Value(traceIDKey).(string)
```

Package-level best practice: hide keys behind typed accessors:

```go
package auth

type key int
var userKey key

func NewContext(ctx context.Context, u *User) context.Context {
    return context.WithValue(ctx, userKey, u)
}

func FromContext(ctx context.Context) (*User, bool) {
    u, ok := ctx.Value(userKey).(*User)
    return u, ok
}
```

### WithCancelCause — cancellation with diagnostic error (go1.20)

```go
ctx, cancel := context.WithCancelCause(parent)
cancel(fmt.Errorf("quota exceeded for user %s", userID))

// Later:
context.Cause(ctx) // returns the error passed to cancel
ctx.Err()          // returns context.Canceled
```

### WithoutCancel — escape parent cancellation (go1.21)

```go
// cleanupCtx is NOT canceled when parent ctx is canceled
cleanupCtx := context.WithoutCancel(ctx)
defer doCleanup(cleanupCtx) // cleanup always runs
```

### AfterFunc — post-cancellation callback (go1.21)

```go
stop := context.AfterFunc(ctx, func() {
    conn.Close() // close connection when context is canceled
})
defer stop() // unregister if we finish before cancellation
```

### Merging two cancellation signals

```go
mergeCancel := func(ctx1, ctx2 context.Context) (context.Context, context.CancelFunc) {
    ctx, cancel := context.WithCancelCause(ctx1)
    stop := context.AfterFunc(ctx2, func() {
        cancel(context.Cause(ctx2))
    })
    return ctx, func() {
        stop()
        cancel(context.Canceled)
    }
}
```

### Standard `select` pattern for cancellation

```go
func Stream(ctx context.Context, out chan<- Value) error {
    for {
        v, err := DoSomething(ctx)
        if err != nil {
            return err
        }
        select {
        case <-ctx.Done():
            return ctx.Err()
        case out <- v:
        }
    }
}
```

### HTTP request with context cancellation

```go
func httpDo(ctx context.Context, req *http.Request, f func(*http.Response, error) error) error {
    c := make(chan error, 1)
    req = req.WithContext(ctx)
    go func() { c <- f(http.DefaultClient.Do(req)) }()
    select {
    case <-ctx.Done():
        <-c // wait for goroutine to finish
        return ctx.Err()
    case err := <-c:
        return err
    }
}
```

## Key APIs (Summary)

| Function | Returns | Added | Purpose |
|---|---|---|---|
| `Background()` | `Context` | 1.0 | Root context — never canceled |
| `TODO()` | `Context` | 1.0 | Placeholder during refactoring |
| `WithCancel(parent)` | `(Context, CancelFunc)` | 1.0 | Manual cancellation |
| `WithCancelCause(parent)` | `(Context, CancelCauseFunc)` | 1.20 | Cancellation with error cause |
| `WithDeadline(parent, d)` | `(Context, CancelFunc)` | 1.0 | Absolute time deadline |
| `WithDeadlineCause(parent, d, cause)` | `(Context, CancelFunc)` | 1.21 | Deadline with diagnostic cause |
| `WithTimeout(parent, d)` | `(Context, CancelFunc)` | 1.0 | Duration-based timeout |
| `WithTimeoutCause(parent, d, cause)` | `(Context, CancelFunc)` | 1.21 | Timeout with diagnostic cause |
| `WithValue(parent, key, val)` | `Context` | 1.0 | Request-scoped key-value |
| `WithoutCancel(parent)` | `Context` | 1.21 | Disconnect from parent cancellation |
| `AfterFunc(ctx, f)` | `func() bool` | 1.21 | Run callback after cancellation |
| `Cause(ctx)` | `error` | 1.20 | Retrieve cancellation cause |

### Context interface

```go
type Context interface {
    Deadline() (deadline time.Time, ok bool)
    Done() <-chan struct{}
    Err() error
    Value(key any) any
}
```

### Error sentinels

```go
context.Canceled         // errors.New("context canceled")
context.DeadlineExceeded // deadlineExceededError{}
```

## Caveats

- **ALWAYS call cancel.** Failing to call the CancelFunc leaks the context and children until the parent cancels. Use `defer cancel()` immediately after `WithCancel`/`WithTimeout`/`WithDeadline`. `go vet` checks for this.
- **Do not store Contexts in structs.** Pass Context explicitly as the first parameter (`ctx context.Context`). See [Contexts and structs](https://go.dev/blog/context-and-structs).
- **Do not pass nil Context.** Passing nil can panic. Use `context.TODO()` if unsure.
- **Context values are NOT optional parameters.** Use only for request-scoped data that transits processes/APIs (trace IDs, auth tokens). Never for configuration or dependencies.
- **Use unexported key types.** Never use `string` or other built-in types as context keys — they collide across packages. Define `type myKey int` or `type myKey struct{}`.
- **WithValue shadows, not mutates.** A derived context wraps the parent. `Value` searches up the chain — a child's key shadows the parent's.
- **Done channel close is async.** It may close after the cancel function returns. Don't rely on immediate close timing.
- **WithoutCancel is deliberate.** Operations under `WithoutCancel` won't stop with the parent. Ensure this behavior is intentional — leaked goroutines are common.
- **AfterFunc stop() does not wait for f.** If `stop()` returns false, f is already running. Coordinate separately if you need to know when f completes.
- **CancelCauseFunc: first write wins.** If the context is already canceled, calling `CancelCauseFunc` does not overwrite the cause.
- **Err() vs Cause():** `Err()` returns `Canceled` or `DeadlineExceeded`. `Cause()` returns the specific error from `CancelCauseFunc`, or falls back to `Err()`. Prefer `Cause()` for diagnostics.
- **TODO() is a code smell.** It signals refactoring-in-progress. Replace with a properly propagated Context as soon as feasible.
- **Never derive from nil.** `WithCancel(nil)` panics.

## Composition Hints

- **Chain contexts through the call stack.** Every function that performs I/O should accept `ctx context.Context` as its first parameter.
- **Use `ctx` with `net/http`:** `req.WithContext(ctx)` attaches a context to an HTTP request. Server-side, `req.Context()` returns the request's context (canceled when the client disconnects).
- **Use `ctx` with `database/sql`:** `db.QueryContext(ctx, ...)`, `db.ExecContext(ctx, ...)` respect cancellation and timeouts.
- **Combine with errgroup for structured concurrency:**

```go
g, ctx := errgroup.WithContext(ctx)
g.Go(func() error { return fetchUser(ctx, id) })
g.Go(func() error { return fetchOrders(ctx, id) })
return g.Wait()
```

- **Nested timeouts:** create shorter deadlines for sub-operations within a broader request context:

```go
ctx, cancel := context.WithTimeout(parentCtx, 100*time.Millisecond)
defer cancel()
result, err := db.QueryContext(ctx, query)
```

- **AfterFunc for resource cleanup:** use to close connections, remove from waitlists, or broadcast to condition variables when a context is canceled — without polling `ctx.Done()` in a goroutine.
- **Cause for structured error diagnosis:** use `WithCancelCause` + `Cause()` to propagate structured cancellation reasons through middleware chains (e.g., rate limiting, auth failure).
