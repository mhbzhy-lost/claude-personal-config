---
name: go-goroutine-channel
description: Goroutines, channels, select, pipeline patterns, and errgroup for concurrent programming in Go.
tech_stack: [backend]
language: [go]
capability: [task-scheduler, stream-processing]
version: "go1.26; errgroup v0.20.0"
collected_at: 2026-04-07
---

# Go Goroutines & Channels

> Source: https://go.dev/doc/effective_go, https://go.dev/ref/spec@go1.26, https://pkg.go.dev/golang.org/x/sync/errgroup@v0.20.0, https://go.dev/blog/pipelines

## Purpose

Goroutines are lightweight threads managed by the Go runtime. Channels are typed conduits for safe communication between goroutines. Together with `select`, `sync.WaitGroup`, and `errgroup.Group`, they form Go's core concurrency toolkit — enabling the CSP-style mantra: "Do not communicate by sharing memory; instead, share memory by communicating."

## When to Use

- Running I/O or CPU-bound work concurrently (parallel API calls, file processing)
- Building streaming data pipelines with fan-out/fan-in stages
- Implementing graceful cancellation across a tree of goroutines
- Coordinating groups of goroutines with error propagation (`errgroup`)
- Bounded parallelism: limiting the number of concurrent operations
- Implementing timeouts, rate limiting, and non-blocking operations via `select`

## Basic Usage

### Goroutine

```go
go func() {
    // runs concurrently
}()
```

### Unbuffered Channel (synchronous)

```go
ch := make(chan int)
go func() { ch <- 42 }()
v := <-ch  // blocks until send
```

### Buffered Channel (asynchronous)

```go
ch := make(chan int, 100)
ch <- 1  // non-blocking if buffer has room
ch <- 2
close(ch)
for v := range ch { /* v=1, then v=2 */ }
```

### Select — wait on multiple channels

```go
select {
case v := <-ch:
    // received
case ch <- x:
    // sent
case <-time.After(5 * time.Second):
    // timeout
case <-ctx.Done():
    // cancelled
default:
    // non-blocking fallback
}
```

### Pipeline: `gen → sq → print`

```go
func gen(nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        for _, n := range nums { out <- n }
        close(out)
    }()
    return out
}

func sq(in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        for n := range in { out <- n * n }
        close(out)
    }()
    return out
}

for n := range sq(sq(gen(2, 3))) {
    fmt.Println(n) // 16, then 81
}
```

### Fan-in with sync.WaitGroup

```go
func merge(cs ...<-chan int) <-chan int {
    var wg sync.WaitGroup
    out := make(chan int)
    for _, c := range cs {
        wg.Add(1)
        go func(c <-chan int) {
            defer wg.Done()
            for n := range c { out <- n }
        }(c)
    }
    go func() { wg.Wait(); close(out) }()
    return out
}
```

### Cancellation via done channel

```go
done := make(chan struct{})
defer close(done)  // broadcast cancellation on return

go func() {
    for {
        select {
        case <-done:
            return
        case v := <-in:
            // process v
        }
    }
}()
```

### errgroup — parallel work with error propagation

```go
g, ctx := errgroup.WithContext(ctx)
g.SetLimit(10)  // max 10 concurrent goroutines

for _, url := range urls {
    url := url
    g.Go(func() error {
        return fetch(ctx, url)
    })
}
if err := g.Wait(); err != nil {
    log.Printf("first error: %v", err)
}
```

### errgroup — bounded parallelism pipeline

```go
g, ctx := errgroup.WithContext(ctx)
paths := make(chan string)

// Stage 1: producer
g.Go(func() error {
    defer close(paths)
    return filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
        if err != nil { return err }
        if info.Mode().IsRegular() {
            select {
            case paths <- path:
            case <-ctx.Done():
                return ctx.Err()
            }
        }
        return nil
    })
})

// Stage 2: N parallel workers
c := make(chan result)
for i := 0; i < 20; i++ {
    g.Go(func() error {
        for path := range paths {
            data, err := os.ReadFile(path)
            if err != nil { return err }
            select {
            case c <- result{path, md5.Sum(data)}:
            case <-ctx.Done():
                return ctx.Err()
            }
        }
        return nil
    })
}
go func() { g.Wait(); close(c) }()

// Collect
for r := range c { m[r.path] = r.sum }
if err := g.Wait(); err != nil { return err }
```

## Key APIs (Summary)

| Primitive | Syntax / Type | Notes |
|-----------|--------------|-------|
| **Start goroutine** | `go f(args)` | Lightweight; managed by runtime |
| **Unbuffered chan** | `make(chan T)` | Synchronous: send blocks until receive |
| **Buffered chan** | `make(chan T, n)` | Non-blocking send until buffer full |
| **Send** | `ch <- v` | Panics if channel closed |
| **Receive** | `v := <-ch` | Returns zero value if closed |
| **Receive+ok** | `v, ok := <-ch` | `ok==false` means closed |
| **Close** | `close(ch)` | Sender only; broadcasts to all receivers |
| **Range** | `for v := range ch` | Exits when channel closed |
| **Send-only type** | `chan<- T` | Direction constraint |
| **Recv-only type** | `<-chan T` | Direction constraint |
| **Select** | `select { case ... }` | Random among ready cases |
| **Done channel** | `make(chan struct{})` | `close(done)` broadcasts cancellation |
| **WaitGroup** | `sync.WaitGroup` | `Add`/`Done`/`Wait` for simple counting |
| **errgroup.WithContext** | `func(ctx) (*Group, ctx)` | Cancels ctx on first error |
| **errgroup.Go** | `func(func() error)` | Blocks if at limit |
| **errgroup.SetLimit** | `func(n int)` | Bounds concurrency (0 = block all) |
| **errgroup.TryGo** | `func(func() error) bool` | Non-blocking, returns if started |
| **errgroup.Wait** | `func() error` | Returns first non-nil error |

## Caveats

- **Goroutines are NOT garbage collected** — they must exit on their own. A leaked goroutine holds memory and runtime resources indefinitely.
- **Sending on a closed channel panics** — only the sender should close. Use `sync.WaitGroup` or done channels to coordinate.
- **Closing a nil channel panics** — always `make` channels before use.
- **Receiving from a closed channel returns zero value instantly** — always check `v, ok := <-ch` to distinguish from a genuine zero value.
- **Unbuffered sends block until receive** — can deadlock. Always pair sends with `select` on a done/cancel channel.
- **Loop variable capture** — `for _, v := range` goroutines capture by reference. Fix: `v := v` or pass as argument. (Go 1.22+ fixes this for `:=` range loops.)
- **Select picks randomly among ready cases** — never rely on case order for correctness.
- **`errgroup` context cancels on first error** — all goroutines must check `ctx.Done()` and return promptly; otherwise they leak.
- **`errgroup` Wait must be called** — errors are silently lost without it.
- **Zero-value `errgroup.Group` has no cancellation** — use `WithContext` for error-triggered cancellation.
- **Buffered channels as "leak fix" is fragile** — prefer explicit done-channel cancellation over guessing buffer sizes.
- **Reading from a nil channel blocks forever** — useful for dynamically disabling `select` cases, but must be intentional.

## Composition Hints

- **Pipeline pattern**: `producer → worker-pool → consumer`. Producer closes its outbound channel; workers range over it; a separate goroutine waits for workers then closes the consumer's input.
- **Fan-out**: multiple goroutines read from the same channel — Go channels are naturally multi-reader safe.
- **Fan-in**: use `sync.WaitGroup` + a closer goroutine, or `errgroup` for error-aware fan-in.
- **Always pair sends with select on done/ctx**: `select { case ch <- v: case <-ctx.Done(): return }`.
- **For simple parallel I/O**: `errgroup` with `SetLimit` is the most concise pattern.
- **For streaming**: channels + `range` + done channel for cancellation. For complex DAGs, consider a dedicated pipeline library or state machine.
- **Testing**: `errgroup` simplifies test cleanup — when `g.Wait()` returns, all goroutines have exited.
