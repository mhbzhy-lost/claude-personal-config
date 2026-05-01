---
name: rust-error-handling
description: "Error handling patterns in Rust: thiserror for library error types, anyhow for application error propagation, Result/Panic and error composition."
tech_stack: [rust]
language: [rust]
capability: [api-design, observability]
version: "thiserror + anyhow, unversioned"
collected_at: 2025-01-01
---

# Rust Error Handling

> Source: https://docs.rs/thiserror/latest/thiserror/, https://docs.rs/anyhow/latest/anyhow/, https://doc.rust-lang.org/book/ch09-00-error-handling.html

## Purpose
Rust error handling splits into two worlds: **library code** uses `thiserror` to define structured, matchable error enums; **application code** uses `anyhow` for ergonomic propagation with rich context. Both build on `Result<T, E>` and the `?` operator.

## When to Use
- **thiserror**: when you're writing a library and downstream code needs to match on specific error variants
- **anyhow**: when you're writing a binary/application and just need errors propagated with context
- **panic!**: for unrecoverable bugs (out-of-bounds, invariants violated) — never for expected failures

## Basic Usage

### Library side: define errors with thiserror

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DataStoreError {
    #[error("data store disconnected")]
    Disconnect(#[from] io::Error),

    #[error("the data for key `{0}` is not available")]
    Redaction(String),

    #[error("invalid header (expected {expected:?}, found {found:?})")]
    InvalidHeader { expected: String, found: String },

    #[error(transparent)]
    Other(#[from] anyhow::Error),  // catch-all for ad-hoc errors
}
```

Key behaviors:
- `#[from]` auto-generates `From` impl → `?` works transparently. Also implies `#[source]`.
- `#[error("...")]` generates `Display`; supports `{0}`, `{var}`, `{var:?}` interpolation
- `#[error(transparent)]` delegates `Display` + `source()` to the inner error
- A field named `source` is auto-detected as the error source; `Backtrace` field auto-provides backtraces (nightly only)

### Application side: propagate with anyhow

```rust
use anyhow::{Context, Result, anyhow, bail, ensure};

fn do_work(path: &str) -> Result<Output> {
    // ? works for anything implementing std::error::Error
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read {}", path))?;

    let parsed: Config = serde_json::from_str(&raw)
        .context("Invalid JSON config")?;

    ensure!(!parsed.items.is_empty(), "Config has no items");

    if parsed.items.len() > 100 {
        bail!("Too many items: {}", parsed.items.len());
    }

    Ok(process(parsed))
}
```

Key behaviors:
- `.context("msg")` — cheap static string; `.with_context(|| ...)` for computed strings
- `bail!("...")` — early return with ad-hoc error
- `ensure!(cond, "...")` — like `assert!` but returns `Err` instead of panicking
- `.downcast_ref::<MyError>()` — recover specific error types from the anyhow chain

## Key APIs (Summary)

| Pattern | Crate | Purpose |
|---|---|---|
| `#[derive(Error)]` | thiserror | Derive `std::error::Error` + `Display` |
| `#[from]` | thiserror | Auto `From` impl, enables `?` |
| `#[source]` | thiserror | Mark `Error::source()` field (auto if named `source`) |
| `#[error(transparent)]` | thiserror | Delegate Display + source through |
| `anyhow::Result<T>` | anyhow | `Result<T, anyhow::Error>` |
| `.context("msg")` | anyhow | Attach context; wraps underlying error |
| `bail!` / `ensure!` | anyhow | Early return macros |
| `.downcast_ref::<T>()` | anyhow | Match on specific inner error type |

## Caveats
- **Library boundary rule**: never expose `anyhow::Error` in a library's public API — it erases the error type. Use `thiserror` for library error types.
- **`#[from]` exclusivity**: a variant with `#[from]` can only contain the source error (+ optional `Backtrace`); no extra payload fields.
- **`#[error(transparent)]` quirk**: the outer type is still distinct. `match` on it still requires the inner variant.
- **Backtraces**: thiserror backtrace capture requires nightly Rust ≥ 1.73. anyhow backtraces work on stable ≥ 1.65, enabled via `RUST_LIB_BACKTRACE=1`.
- **no_std**: anyhow supports it with `default-features = false`, but on Rust < 1.81 foreign `?` may need `.map_err(anyhow::Error::msg)`.

## Composition Hints
- **Library + binary split**: define error types with `thiserror` in `-core` or `-types` crate. Use `anyhow` only in `main.rs` / binary entry points.
- **Wrapping foreign errors**: `#[from]` on each foreign error variant keeps the error chain intact. Use `#[error(transparent)]` for an "anything else" slot.
- **Context is for humans**: write context messages describing *what the program was doing*, not *what went wrong* (the inner error already says that). "Failed to read config from {}" is good; "IO error" is useless.
- **anyhow → thiserror bridge**: anyhow's `Error` implements `std::error::Error`, so a `#[from] anyhow::Error` variant in a thiserror enum works as a catch-all.
