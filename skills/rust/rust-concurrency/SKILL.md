---
name: rust-concurrency
description: Rust concurrency primitives — channels (std/tokio/flume/crossbeam), synchronization (Mutex/RwLock/Notify/Barrier/Semaphore), and channel selection guide.
tech_stack: [backend]
language: [rust]
capability: [message-queue, state-management, realtime-messaging]
version: "Tokio unversioned, std 1.0.0+"
collected_at: 2025-01-01
---

# Rust Concurrency Primitives

> Source: https://docs.rs/tokio/latest/tokio/sync/, https://docs.rs/flume/latest/flume/, https://docs.rs/crossbeam/latest/crossbeam/, https://doc.rust-lang.org/std/sync/mpsc/index.html

## Purpose

Comprehensive guide to Rust's concurrency primitives across std, Tokio, crossbeam, and flume. Covers channel selection, async and sync synchronization types, and common patterns for task coordination.

## When to Use

- Choosing the right channel type for your workload (MPSC, MPMC, broadcast, oneshot, watch)
- Coordinating async tasks with Mutex, RwLock, Semaphore, Barrier, or Notify
- Mixing sync and async channel communication (flume)
- High-performance multi-threaded pipelines (crossbeam scoped threads, work-stealing deques)
- Implementing request/response, fan-out, config propagation, or rate-limiting patterns

## Basic Usage

### Channel Quick-Select

| Channel | Backend | Pattern | Async | Key Trait |
|---|---|---|---|---|
| `std::sync::mpsc::channel()` | std | MPSC, unbounded | No | Sender is Clone |
| `std::sync::mpsc::sync_channel(N)` | std | MPSC, bounded (0=rendezvous) | No | Blocks when full |
| `tokio::sync::mpsc::channel(N)` | tokio | MPSC, bounded | Yes | `.await` on send/recv |
| `tokio::sync::oneshot::channel()` | tokio | SPSC, one-shot | Yes | Single value only |
| `tokio::sync::broadcast::channel(N)` | tokio | MPMC, every value to all | Yes | T: Clone required |
| `tokio::sync::watch::channel(init)` | tokio | MPMC, latest value only | Yes | `changed().await` |
| `flume::unbounded()` / `bounded(N)` | flume | MPMC, mixed sync+async | Optional | Drop-in for std mpsc |
| `crossbeam::channel::unbounded()` | crossbeam | MPMC, high-perf sync | No | `select!` macro |

### State Synchronization Quick-Select

| Primitive | Backend | Use For |
|---|---|---|
| `std::sync::Mutex<T>` | std | Short non-async critical sections |
| `tokio::sync::Mutex<T>` | tokio | Critical sections spanning `.await` |
| `std::sync::RwLock<T>` | std | Read-heavy sync access |
| `tokio::sync::RwLock<T>` | tokio | Read-heavy async access |
| `tokio::sync::Notify` | tokio | Wake signal without data |
| `tokio::sync::Semaphore` | tokio | Rate limiting, connection pools |
| `tokio::sync::Barrier` | tokio | N tasks synchronize at a point |

### Common Patterns

**Request/Response (mpsc + oneshot):**
```rust
let (cmd_tx, mut cmd_rx) = mpsc::channel::<(Command, oneshot::Sender<u64>)>(100);
// Spawn manager task that processes commands, sends result on oneshot
// Clients: create oneshot pair, send command + response Sender, await response Receiver
```

**Fan-out (broadcast):**
```rust
let (tx, _) = broadcast::channel(16);
let mut rx1 = tx.subscribe();
let mut rx2 = tx.subscribe();
tx.send(data).unwrap(); // both rx1 and rx2 receive it
```

**Config / Shutdown (watch):**
```rust
let (tx, mut rx) = watch::channel(initial_config);
// Producer: tx.send(new_config).unwrap();
// Consumer loop: rx.changed().await; let cfg = rx.borrow_and_update().clone();
```

**Rate Limiting (Semaphore):**
```rust
let sem = Arc::new(Semaphore::new(10));
let _permit = sem.acquire().await.unwrap(); // permit auto-returned on drop
```

**Wake Signal (Notify):**
```rust
let notify = Arc::new(Notify::new());
// Waiter: notify.notified().await;
// Waker: notify.notify_one(); // or notify.notify_waiters();
```

## Key APIs (Summary)

- **std::sync::mpsc** — `channel()`, `sync_channel(N)`, `Sender::send()`, `Receiver::recv()` / `try_recv()` / `recv_timeout()`
- **tokio::sync::mpsc** — `channel(cap)`, `send().await`, `recv().await` returns `Option<T>`, `try_send()`, `blocking_send()`
- **tokio::sync::oneshot** — `channel()`, `tx.send(self, val)`, `rx.await`
- **tokio::sync::broadcast** — `channel(cap)`, `send()`, `subscribe()`, `recv().await` returns `Result`
- **tokio::sync::watch** — `channel(init)`, `send()`, `send_replace()`, `send_modify()`, `changed().await`, `borrow()`, `borrow_and_update()`
- **tokio::sync::Mutex** — `lock().await` returns `MutexGuard`, `try_lock()`, `blocking_lock()`
- **tokio::sync::RwLock** — `read().await`, `write().await`, `try_read()`, `try_write()`
- **tokio::sync::Notify** — `notify_one()`, `notify_waiters()`, `notified().await`
- **tokio::sync::Semaphore** — `new(permits)`, `acquire().await`, `try_acquire()`, `add_permits()`, `close()`
- **tokio::sync::Barrier** — `new(n)`, `wait().await` returns `BarrierWaitResult` with `is_leader()`
- **flume** — `unbounded()`, `bounded(N)`, `Sender::send()`, `Receiver::recv()`
- **crossbeam** — `scope(|s| s.spawn(|| ...))` for borrowing stack locals, `select!` macro, `ArrayQueue`, `SegQueue`

## Caveats

- **Mutex across .await**: `std::sync::Mutex` must NOT be held across `.await` — it blocks the thread. Use `tokio::sync::Mutex` for async critical sections. For short sync sections, prefer `std::sync::Mutex` (lower overhead).
- **broadcast send fails** when zero active receivers exist. Subscribe receivers before sending, or handle `SendError`.
- **watch skips values** — only the latest is stored. Use `broadcast` when every value must be received.
- **mpsc recv returns `None`** (tokio) vs `Err(RecvError)` (std) when all senders drop. Always drop the last `tx` in the spawning task to unblock receivers.
- **Capacity drives backpressure**: too-small = sender stalls; too-large = masks slow consumers. Tune based on expected throughput.
- **broadcast lag**: slow receivers fill the channel; `send()` returns `Err(SendError)` when full.
- **Semaphore permits**: RAII-based — the permit auto-returns on drop. Be careful to hold the guard for the intended scope only.
- **No reentrant locking**: `tokio::sync::Mutex` deadlocks if the same task locks twice.
- **Runtime compatibility**: tokio sync primitives work across Tokio instances and non-Tokio contexts, except `*_timeout` methods which require the Tokio timer.

## Composition Hints

- **Actor pattern**: Combine `tokio::sync::mpsc` (commands in) with `tokio::sync::oneshot` (responses out) for encapsulated state management.
- **Graceful shutdown**: Use a `tokio::sync::watch` channel to broadcast a shutdown signal, combined with `tokio::select!` in worker loops.
- **Hybrid sync/async**: Use `flume` when some producers are sync threads and consumers are async tasks, or vice versa.
- **Scoped parallelism**: Use `crossbeam::scope` when you need threads that borrow stack data without `Arc` — works well for CPU-bound parallel work.
- **Broadcast + watch hybrid**: Use `broadcast` for event streams, `watch` for current state snapshots — together they cover pub/sub needs.
- **Semaphore as resource pool**: Wrap connection pools, file handles, or any finite resource behind a `Semaphore` with permit count equal to pool size.
