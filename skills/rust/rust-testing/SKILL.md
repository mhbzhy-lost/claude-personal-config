---
name: rust-testing
description: Rust testing toolkit — unit/integration tests, async tests with tokio, criterion benchmarks, proptest property testing, and rstest fixtures.
tech_stack: [backend]
language: [rust]
capability: [unit-testing, integration-testing]
version: "Rust stable, Criterion.rs/proptest/rstest unversioned"
collected_at: 2025-01-01
---

# Rust Testing & Benchmarking

> Source: https://doc.rust-lang.org/book/ch11-00-testing.html, https://bheisler.github.io/criterion.rs/book/, https://proptest-rs.github.io/proptest/, https://docs.rs/rstest/latest/rstest/

## Purpose

Complete guide to Rust's testing ecosystem: built-in `#[test]` harness, async testing with `#[tokio::test]`, statistical benchmarking with Criterion.rs, property-based testing with proptest, and fixture-driven/parametric testing with rstest.

## When to Use

- **`#[test]`**: Foundation for all Rust projects — unit tests in `#[cfg(test)] mod tests`, integration tests in `tests/`, doc tests in `///` comments.
- **`#[tokio::test]`**: Any async code using Tokio runtime — channels, I/O, timers, spawning.
- **Criterion.rs**: Performance-sensitive code requiring statistical rigor — detects regressions, measures optimizations, generates HTML reports.
- **proptest**: Large input spaces where you want automatic edge-case discovery — parsers, serialization round-trips, mathematical invariants.
- **rstest**: Repetitive setup (fixtures), table-driven tests (many input/output pairs), combinatorial argument grids.

## Basic Usage

### Test Organization

```
src/lib.rs
  pub fn add_two(x: i32) -> i32 { x + 2 }
  #[cfg(test)]
  mod tests {
      use super::*;
      #[test]
      fn it_adds_two() { assert_eq!(4, add_two(2)); }
      #[test]
      #[should_panic(expected = "overflow")]
      fn it_panics() { panic!("overflow occurred"); }
      #[test]
      #[ignore]  // run with: cargo test -- --ignored
      fn slow_test() { /* ... */ }
  }

tests/
  integration_test.rs   // each .rs = separate crate, tests public API only
  common/mod.rs         // shared helpers, NOT compiled as a test crate
```

### Async Tests

```rust
#[tokio::test]
async fn test_channel() {
    let (tx, mut rx) = tokio::sync::mpsc::channel(100);
    tx.send(42).await.unwrap();
    assert_eq!(rx.recv().await.unwrap(), 42);
}

// Multi-threaded runtime:
#[tokio::test(flavor = "multi_thread")]
async fn test_concurrent() { /* ... */ }
```

### Criterion Benchmarks

```rust
// benches/my_bench.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn bench_fib(c: &mut Criterion) {
    c.bench_function("fib 20", |b| b.iter(|| fibonacci(black_box(20))));
}

criterion_group!(benches, bench_fib);
criterion_main!(benches);
// Run: cargo bench
```

Grouped benchmarks with shared setup:
```rust
fn bench_sorting(c: &mut Criterion) {
    let mut group = c.benchmark_group("sorting");
    let data: Vec<u64> = (0..10000).rev().collect();
    group.bench_function("unstable", |b| {
        b.iter(|| { let mut d = data.clone(); d.sort_unstable(); black_box(d); })
    });
    group.bench_function("stable", |b| {
        b.iter(|| { let mut d = data.clone(); d.sort(); black_box(d); })
    });
    group.finish();
}
```

### proptest Property Tests

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn addition_is_commutative(a in any::<i64>(), b in any::<i64>()) {
        assert_eq!(a + b, b + a);
    }

    #[test]
    fn json_roundtrip(v in any::<MyStruct>()) {
        let json = serde_json::to_string(&v).unwrap();
        let back: MyStruct = serde_json::from_str(&json).unwrap();
        assert_eq!(v, back);
    }
}
```

### rstest Fixtures & Parametric Tests

```rust
use rstest::*;

// Fixtures — injected by name
#[fixture]
fn user() -> User { User::new("alice") }

#[rstest]
fn test_with_fixture(user: User) {
    assert_eq!(user.name, "alice");
}

// Table-driven (parametric) — each #[case] = one test
#[rstest]
#[case(0, 0)]
#[case(1, 1)]
#[case(2, 1)]
#[case(3, 2)]
fn fibonacci_test(#[case] input: u32, #[case] expected: u32) {
    assert_eq!(expected, fibonacci(input));
}

// Value combinations — Cartesian product
#[rstest]
fn combinations(
    #[values(State::Init, State::Start)] state: State,
    #[values(Event::Error, Event::Fatal)] event: Event,
) {
    // 2 × 2 = 4 tests generated
    assert_eq!(State::Terminated, state.process(event));
}

// Fixtures with defaults and overrides
#[fixture]
fn config(#[default("localhost")] host: &str, #[default(8080)] port: u16) -> Config {
    Config { host: host.to_string(), port }
}
#[rstest]
fn test_custom(#[with("example.com", 3000)] config: Config) {
    assert_eq!(config.host, "example.com");
}
```

## Key APIs (Summary)

- **Built-in**: `#[test]`, `#[should_panic(expected = "...")]`, `#[ignore]`, `assert!`, `assert_eq!`, `assert_ne!`
- **Test runner**: `cargo test`, `cargo test -- --nocapture`, `cargo test name_filter`, `cargo test --test integration_file`
- **tokio**: `#[tokio::test]`, `#[tokio::test(flavor = "multi_thread")]`
- **Criterion**: `Criterion::bench_function()`, `Criterion::benchmark_group()`, `black_box()`, `criterion_group!`, `criterion_main!`, `BenchmarkGroup::bench_function()`, `sample_size()`, `measurement_time()`
- **proptest**: `proptest! { #[test] fn name(strat in strategy) { ... } }`, `any::<T>()`, `prop::collection::vec()`, `prop::option::of()`
- **rstest**: `#[rstest]`, `#[fixture]`, `#[case(a, b)]`, `#[values(v1, v2)]`, `#[default(val)]`, `#[with(args)]`, `#[case]` on arguments

## Caveats

- **Integration test compilation**: Every `.rs` in `tests/` is a separate crate — put shared helpers in `tests/common/mod.rs` so they aren't compiled as test targets.
- **`#[should_panic]` is coarse**: Only checks that a panic occurs somewhere. Always use `expected = "..."` to verify the specific panic message.
- **Criterion `black_box` is mandatory**: Without wrapping inputs and outputs in `black_box()`, the compiler may optimize away the entire benchmark, yielding zero-measurement results.
- **Criterion needs a quiet machine**: CPU throttling and background processes pollute results. Criterion detects outliers, but run on an idle machine for reliable data.
- **proptest ≠ fuzzer**: Finds logical bugs through property violations, not memory-safety issues. Use `cargo-fuzz` (libfuzzer) for coverage-guided fuzzing.
- **proptest shrinking**: Complex strategies may not shrink to the minimal case — keep generators simple.
- **rstest + async**: Stack attributes: `#[rstest]` then `#[tokio::test]` (or `#[rstest] #[tokio::test] async fn ...`).
- **`cargo test` vs `cargo bench`**: Separate profiles — benchmarks use `--release`. Code may behave differently under optimizations.
- **Fixtures run per test case**: Each `#[case]` variant triggers its own fixture invocation, which is fine but be aware of repeated setup costs.
- **Magic conversion**: rstest string literals auto-convert via `FromStr` — types like `SocketAddr`, `PathBuf`, and numeric types work out of the box.

## Composition Hints

- **Layered testing strategy**: Unit tests (`#[test]`) for logic, integration tests (`tests/`) for API correctness, proptest for edge-case discovery, Criterion for regression detection.
- **Fixture hierarchy**: Compose rstest fixtures — a `db` fixture can depend on a `config` fixture, which depends on an `env` fixture. Keep fixtures small and focused.
- **proptest + rstest**: Use rstest `#[case]` for known edge cases and proptest for discovering unknown ones on the same function.
- **Benchmark what matters**: Only benchmark functions where performance is critical. Use Criterion's comparison mode to evaluate alternative implementations side by side.
- **Doc tests as examples**: Keep doc-test examples simple and self-contained — they serve double duty as documentation and correctness checks.
