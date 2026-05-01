---
name: rust-tokio
description: Asynchronous runtime for Rust — task scheduling, I/O, synchronization, and time utilities
tech_stack: [rust]
language: [rust]
capability: [task-scheduler, message-queue]
version: "tokio 1.52.1"
collected_at: 2025-07-11
---

# Tokio

> Source: https://tokio.rs/tokio/tutorial, https://docs.rs/tokio/latest/tokio/, https://github.com/tokio-rs/tokio

## Purpose

Tokio is the de-facto asynchronous runtime for Rust. It provides a multi-threaded work-stealing task scheduler, an I/O event reactor (epoll/kqueue/IOCP), async TCP/UDP/Unix sockets, synchronization primitives, channels, and time utilities. It is the foundation for virtually all async Rust networking code, including `axum`, `hyper`, `tonic`, and `reqwest`.

## When to Use

- Building IO-bound network servers handling many concurrent connections (TCP, HTTP, WebSocket, gRPC).
- Orchestrating async tasks with racing (`select!`), joining (`join!`), timeouts, and cancellation.
- Replacing blocking standard-library I/O with async equivalents.
- Graceful shutdown coordination using signals and `CancellationToken`.

**Do NOT use Tokio for:**
- CPU-bound parallelism — use `rayon` instead.
- Heavy filesystem I/O — OSes lack truly async file APIs; Tokio's `fs` delegates to `spawn_blocking`.
- Single web requests — prefer a blocking HTTP client unless already in an async context.

## Basic Usage

```rust
// Default multi-threaded runtime
#[tokio::main]
async fn main() {
    // Your async code here
}

// Custom runtime configuration
let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(4)
    .enable_all()
    .build()
    .unwrap();
rt.block_on(async { /* ... */ });

// Cargo.toml
// tokio = { version = "1", features = ["full"] }
```

Environment variable `TOKIO_WORKER_THREADS` overrides the default core thread count.

## Key APIs

### Task spawning

```rust
// Spawn an async task — runs concurrently on the runtime
let handle: JoinHandle<Output> = tokio::spawn(async { /* ... */ });
let result = handle.await?;

// Spawn blocking/sync work on a dedicated thread pool
let result = tokio::task::spawn_blocking(|| {
    // CPU-intensive or blocking code — safe here
    42
}).await.unwrap();

// Yield to the scheduler
tokio::task::yield_now().await;
```

### select! — race multiple futures

Waits on multiple branches, returns when the **first** completes, and **cancels** all remaining branches:

```rust
tokio::select! {
    result = async_operation() => { /* handle result */ }
    _ = tokio::time::sleep(Duration::from_secs(5)) => { /* timeout */ }
    Some(msg) = rx.recv() => { /* channel message */ }
}
```

Add `biased;` as the first token inside `select!` to make branch selection deterministic by order.

### join! / try_join! — await all futures

```rust
// Wait for all to complete
let (a, b) = tokio::join!(future_a, future_b);

// Return on first Err
let (a, b) = tokio::try_join!(fallible_a, fallible_b)?;
```

### Synchronization primitives (`tokio::sync`)

```rust
// Channels
let (tx, mut rx) = tokio::sync::mpsc::channel(32);        // bounded MPMC
let (tx, rx) = tokio::sync::oneshot::channel();            // single value
let (tx, mut rx) = tokio::sync::broadcast::channel(16);    // multi-consumer
let (tx, rx) = tokio::sync::watch::channel(initial);       // latest-value

// Async locking (use std::sync::Mutex for brief, non-.await locks)
let m = tokio::sync::Mutex::new(value);
let g = m.lock().await;

let rw = tokio::sync::RwLock::new(value);
let r = rw.read().await;
let w = rw.write().await;

// Coordination
let barrier = tokio::sync::Barrier::new(n);
let semaphore = tokio::sync::Semaphore::new(permits);
let notify = tokio::sync::Notify::new();
```

### Time

```rust
tokio::time::sleep(Duration::from_secs(1)).await;

// Timeout wrapping
match tokio::time::timeout(Duration::from_secs(5), op()).await {
    Ok(Ok(result)) => { /* success within timeout */ }
    Ok(Err(e)) => { /* operation failed */ }
    Err(_elapsed) => { /* timed out */ }
}

// Periodic tick
let mut interval = tokio::time::interval(Duration::from_millis(100));
loop {
    interval.tick().await;
    // do periodic work
}
```

### Graceful shutdown

```rust
use tokio::signal;

// Wait for Ctrl-C
tokio::select! {
    _ = signal::ctrl_c() => { /* initiate shutdown */ }
    _ = server_loop => { /* normal completion */ }
}

// Or use CancellationToken from tokio-util:
use tokio_util::sync::CancellationToken;
let token = CancellationToken::new();
let child = token.child_token();

tokio::spawn(async move {
    tokio::select! {
        _ = child.cancelled() => { /* cleanup and return */ }
        result = work() => { /* ... */ }
    }
});
token.cancel(); // signals all child tokens
```

### TCP echo server (complete)

```rust
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    loop {
        let (mut socket, _) = listener.accept().await?;
        tokio::spawn(async move {
            let mut buf = [0; 1024];
            loop {
                let n = match socket.read(&mut buf).await {
                    Ok(0) => return,
                    Ok(n) => n,
                    Err(_) => return,
                };
                if socket.write_all(&buf[..n]).await.is_err() { return; }
            }
        });
    }
}
```

## Caveats

1. **Never block the runtime**: Code that runs long without `.await` starves other tasks. Use `spawn_blocking` for blocking work. Never call `std::thread::sleep` — use `tokio::time::sleep`.

2. **`tokio::sync::Mutex` vs `std::sync::Mutex`**: Prefer `std::sync::Mutex` for brief critical sections. Only use `tokio::sync::Mutex` when the lock must be held across `.await` points.

3. **Cancellation is cooperative**: Dropping a `JoinHandle` only cancels at the next `.await`. A task that never yields cannot be cancelled. Use `CancellationToken` for explicit cancellation points.

4. **Filesystem I/O is not truly async**: `tokio::fs` uses `spawn_blocking` internally. Heavy file I/O won't scale better than a threadpool.

5. **`select!` is biased by default**: If multiple branches are ready, the first listed wins. Use `biased;` for deterministic ordering.

6. **Runtime must be dropped safely**: Use `Runtime::shutdown_timeout()` rather than relying on `Drop` in complex shutdown scenarios.

## Composition Hints

- **With `rayon`**: Use `spawn_blocking` to bridge sync parallel computation: run `rayon` inside `spawn_blocking`, send results back via `oneshot` channel.
- **With `axum`/`hyper`**: These are built on Tokio. Use `#[tokio::main]` and enable `rt-multi-thread` + `macros` features.
- **With `reqwest`**: The async `reqwest` client requires Tokio as its runtime.
- **With `sqlx`**: Async database queries run on Tokio; use `tokio::sync` primitives for connection pool sharing.
- **Feature flags for libraries**: Library authors should enable only needed features (`rt`, `net`, etc.) rather than `full`, to keep compile times small.
