---
name: go-sync
description: Go sync 与 sync/atomic 并发原语：Mutex/RWMutex/WaitGroup/Cond/Once/Pool/Map 及原子操作选型指南
tech_stack: [go]
language: [go]
capability: [state-management]
version: "go1.26.2"
collected_at: 2026-04-07
---

# Go sync & sync/atomic

> Source: https://pkg.go.dev/sync, https://pkg.go.dev/sync/atomic

## Purpose

Package sync provides mutual exclusion locks (Mutex, RWMutex), goroutine coordination (WaitGroup, Cond), one-time initialization (Once, OnceFunc, OnceValue), concurrent maps (sync.Map), and object pools (sync.Pool). Package sync/atomic provides lock-free atomic memory primitives — counters, flags, CAS, swaps — via typed wrappers (Int32, Int64, Bool, Pointer[T], Value) that are safer than the legacy function-style API.

## When to Use

- **Mutex**: single-writer protection of shared mutable state.
- **RWMutex**: read-heavy workloads — multiple concurrent readers, single writer. Writers do not starve readers.
- **WaitGroup**: wait for N goroutines to finish. Use `wg.Go(f)` (go1.22) for bounded concurrency.
- **Once / OnceFunc / OnceValue / OnceValues**: lazy thread-safe singleton initialization. Prefer OnceValue over Once+closure for single-value init.
- **sync.Map**: cache with write-once-read-many pattern, or disjoint key sets across goroutines. For everything else, use regular `map` + Mutex.
- **Pool**: reuse temporary objects (buffers, scratch space) to reduce GC pressure.
- **sync/atomic**: lock-free counters, state flags, hot-path reads. Always prefer typed atomics (`atomic.Int64`) over legacy functions (`AddInt64`).
- **Cond**: rarely needed — prefer channel close (broadcast) or channel send (signal).

## Basic Usage

### Mutex

```go
var mu sync.Mutex
var counter int

mu.Lock()
counter++
mu.Unlock()
```

### RWMutex

```go
var mu sync.RWMutex
var cache map[string]string

// reader
mu.RLock()
v := cache[key]
mu.RUnlock()

// writer
mu.Lock()
cache[key] = value
mu.Unlock()
```

Use `RLocker()` when a function expects a `sync.Locker` but should only take a read lock:

```go
l := mu.RLocker()
someFunc(l) // calls l.Lock() → RLock, l.Unlock() → RUnlock
```

### WaitGroup

```go
var wg sync.WaitGroup
for i := 0; i < 10; i++ {
    wg.Add(1)
    go func(i int) {
        defer wg.Done()
        process(i)
    }(i)
}
wg.Wait()
```

Go 1.22 `wg.Go(f)` for bounded concurrency:

```go
var wg sync.WaitGroup
for _, item := range items {
    wg.Go(func() {
        process(item)
    })
}
wg.Wait()
```

### Once / OnceValue

```go
// Once — fire-and-forget init
var once sync.Once
once.Do(func() { setup() })

// OnceValue — return-value init (go1.21), callable from any goroutine
var getConfig = sync.OnceValue(func() *Config {
    return loadConfig("config.yaml")
})

cfg := getConfig() // safe for concurrent use
```

### Pool

```go
var bufPool = sync.Pool{
    New: func() any { return new(bytes.Buffer) },
}

func process(w io.Writer, data string) {
    b := bufPool.Get().(*bytes.Buffer)
    defer bufPool.Put(b)
    b.Reset()
    b.WriteString(data)
    w.Write(b.Bytes())
}
```

Key pattern: always `Reset()` after Get, always `Put()` after use. Pool may discard items at any time — it is a free list, not a cache.

### sync/atomic typed API

```go
var counter atomic.Int64
counter.Add(1)
n := counter.Load()

var ready atomic.Bool
ready.Store(true)
if ready.Load() { /* ... */ }

var cfg atomic.Value
cfg.Store(&Config{Port: 8080})
c := cfg.Load().(*Config)
```

### atomic CAS loop

```go
var state atomic.Int32

// compare-and-swap retry loop
for {
    old := state.Load()
    new := old | flagReady
    if state.CompareAndSwap(old, new) {
        break
    }
}
```

## Key APIs (Summary)

| Primitive | Key Methods | Go Version |
|---|---|---|
| `sync.Mutex` | `Lock()`, `Unlock()`, `TryLock()` | 1.0 / TryLock: 1.18 |
| `sync.RWMutex` | `Lock()`, `Unlock()`, `RLock()`, `RUnlock()`, `TryLock()`, `TryRLock()`, `RLocker()` | 1.0 |
| `sync.WaitGroup` | `Add(delta)`, `Done()`, `Wait()`, `Go(f)` | 1.0 / Go: 1.22 |
| `sync.Once` | `Do(f)` | 1.0 |
| `sync.OnceFunc` | returns `func()` | 1.21 |
| `sync.OnceValue[T]` | returns `func() T` | 1.21 |
| `sync.OnceValues[T1,T2]` | returns `func() (T1,T2)` | 1.21 |
| `sync.Cond` | `NewCond(l)`, `Wait()`, `Signal()`, `Broadcast()` | 1.0 |
| `sync.Map` | `Load`, `Store`, `Delete`, `LoadOrStore`, `Swap`, `CompareAndSwap`, `CompareAndDelete`, `Range`, `Clear` | 1.9+ |
| `sync.Pool` | `Get()`, `Put(x)`, `New` field | 1.3 |
| `atomic.Int64` etc. | `Load`, `Store`, `Swap`, `CAS`, `Add`, `And`, `Or` | 1.19+ |
| `atomic.Value` | `Load`, `Store`, `Swap`, `CompareAndSwap` | 1.4+ |
| `atomic.Bool` | `Load`, `Store`, `Swap`, `CompareAndSwap` | 1.19 |
| `atomic.Pointer[T]` | `Load`, `Store`, `Swap`, `CompareAndSwap` | 1.19 |

## Caveats

- **Never copy** sync types after first use — silent corruption. `go vet -copylocks` detects this.
- **Mutex.Unlock on unlocked mutex** is a fatal runtime panic. `defer mu.Unlock()` right after `mu.Lock()` is the standard pattern.
- **RWMutex: no recursive read-locking.** If a writer is waiting, new RLock calls block. This prevents writer starvation.
- **RWMutex: no lock upgrade/downgrade.** RLock → Lock is forbidden; Lock → RLock is forbidden.
- **Once.Do deadlock**: if `f` calls `Do` on the same `Once`, it deadlocks. If `f` panics, the Once is considered "done" and future calls return immediately without executing.
- **Cond: always Wait in a loop.** Spurious wakeups are possible. Check `!condition()` in the loop body.
- **Cond vs channels**: prefer `close(ch)` for broadcast, `ch <- struct{}{}` for signal.
- **sync.Map is niche.** For most use cases, `map[K]V` + `sync.RWMutex` is clearer and type-safe. Only use sync.Map for write-once-read-many caches or disjoint-key workloads.
- **Pool items can be GC'd at any time.** Not a cache — do not rely on items persisting. Always `New` should return pointer types.
- **atomic.Value: all stored values must be the same concrete type.** First Store determines the type. nil Store panics.
- **64-bit atomic alignment on 32-bit platforms**: the legacy functions require 8-byte alignment; typed atomics handle it automatically. Always prefer typed.
- **TryLock is a code smell.** Correct uses exist but are rare; it often masks a deeper concurrency design issue.
- **WaitGroup.Add before goroutine start.** Add before the goroutine that will call Done, or Wait may return prematurely.

## Composition Hints

- **Mutex + map** is the standard concurrent map pattern. Wrap in a struct:

```go
type SafeCache struct {
    mu    sync.RWMutex
    items map[string]Item
}

func (c *SafeCache) Get(key string) (Item, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    v, ok := c.items[key]
    return v, ok
}
```

- **WaitGroup + errgroup** for error propagation: use `golang.org/x/sync/errgroup` when you need the first error across goroutines. Plain WaitGroup only signals completion.
- **OnceValue for lazy config**: avoids init() side effects, works with dependency injection.

```go
var dbOnce = sync.OnceValues(func() (*sql.DB, error) {
    return sql.Open("postgres", dsn)
})
```

- **atomic.Value for hot-path reads**: ideal for configs that change infrequently but are read on every request — avoids Mutex contention entirely.
- **Pool for fmt-style buffer reuse**: any package with high buffer churn benefits. Always Get→Reset→use→Put.
- **Atomic CAS for lock-free state machines**: use typed `CompareAndSwap` in a retry loop for simple flag transitions without taking a full Mutex.
