---
name: rust-type-system
description: "Rust type system fundamentals: generics, traits and trait objects, Send/Sync, dyn vs impl Trait, lifetimes, and GAT."
tech_stack: [rust]
language: [rust]
capability: [api-design]
version: "Rust language, stable"
collected_at: 2025-01-01
---

# Rust Type System & Traits

> Source: https://doc.rust-lang.org/book/ch10-00-generics.html, https://doc.rust-lang.org/nomicon/send-and-sync.html, https://doc.rust-lang.org/reference/items/traits.html, https://rust-lang.github.io/generic-associated-types-initiative/explainer/motivation.html

## Purpose
Rust's type system encodes ownership, thread safety, and interface contracts at compile time. The key constructs — generics, traits, lifetimes, Send/Sync, and GAT — work together to eliminate entire classes of runtime bugs without a GC.

## When to Use

| Pattern | When | Cost |
|---|---|---|
| `<T: Trait>` (generics) | Hot paths, static dispatch, zero-cost | Slightly larger binary (monomorphization) |
| `impl Trait` (arg position) | Syntactic sugar for `<T: Trait>` | Same as generics |
| `impl Trait` (return) | Opaque return type; caller only sees trait | No runtime cost, but type is unnamed |
| `dyn Trait` (trait object) | Heterogeneous collections, type erasure | Vtable dispatch per call, heap allocation (if `Box`) |
| GAT | Associated type needs per-call lifetime from `self` | Compile-time only |
| `Send` bound | Spawning on another thread (`tokio::spawn`) | Compile-time marker |
| `Sync` bound | Sharing via `Arc` across threads | Compile-time marker |

## Basic Usage

### Generics: eliminate code duplication

```rust
// Before: duplicated for each type
fn largest_i32(list: &[i32]) -> &i32 { /* ... */ }
fn largest_char(list: &[char]) -> &char { /* ... */ }

// After: single generic implementation
fn largest<T: PartialOrd>(list: &[T]) -> &T {
    let mut largest = &list[0];
    for item in list {
        if item > largest { largest = item; }
    }
    largest
}
```

### Traits: define shared behavior

```rust
trait Summary {
    // Required method
    fn summarize(&self) -> String;

    // Default implementation
    fn summarize_author(&self) -> String {
        format!("(author unavailable)")
    }
}

impl Summary for Article {
    fn summarize(&self) -> String {
        format!("{} by {}", self.headline, self.author)
    }
}
```

### Trait objects (dyn Trait) for heterogeneous collections

```rust
trait Draw { fn draw(&self); }

let components: Vec<Box<dyn Draw>> = vec![
    Box::new(Button { label: "OK".into() }),
    Box::new(TextField { placeholder: "name".into() }),
];
for c in &components { c.draw(); }
```

### impl Trait in return position (opaque types)

```rust
fn make_adder(x: i32) -> impl Fn(i32) -> i32 {
    move |y| x + y   // caller only knows it's impl Fn, not the concrete closure type
}
```

## Key APIs (Summary)

### Send & Sync — the thread-safety foundation

| Trait | Meaning | Auto-derived? |
|---|---|---|
| `Send` | Safe to transfer ownership to another thread | Yes — if all fields are `Send` |
| `Sync` | Safe to share `&T` across threads | Yes — if all fields are `Sync` |

**Types that break auto-derivation** (and why):

| Type | Lost traits | Reason |
|---|---|---|
| `*const T`, `*mut T` | `!Send + !Sync` | Raw pointer, no safety guard |
| `UnsafeCell<T>` | `!Sync` | Interior mutability without synchronization |
| `Cell<T>`, `RefCell<T>` | `!Sync` | Contain `UnsafeCell` |
| `Rc<T>` | `!Send + !Sync` | Unsynchronized reference count |
| `MutexGuard<'_, T>` | `!Send` | Destructor must run on lock-acquiring thread |

### Dyn compatibility checklist (trait can be `dyn Trait` if ALL hold)

1. No `Self: Sized` supertrait
2. No associated constants
3. No associated types with generic parameters
4. All methods are dispatchable: no type parameters, receiver is `&self`/`&mut self`/`Box<Self>`/`Rc<Self>`/`Arc<Self>`/`Pin<P>`, no `-> impl Trait`, no `async fn`
5. Methods with `where Self: Sized` are allowed but non-dispatchable through `dyn Trait`

### impl Trait vs dyn Trait decision

```rust
// Static dispatch: use when concrete type is known at compile time
fn process_static(items: impl Iterator<Item = String>) { ... }

// Dynamic dispatch: use when types vary at runtime
fn process_dynamic(items: &mut dyn Iterator<Item = String>) { ... }

// In return position: impl Trait is opaque, dyn Trait is explicit
fn returns_impl() -> impl Display { 42 }          // caller can't name the type
fn returns_dyn() -> Box<dyn Display> { Box::new(42) } // explicit heap allocation
```

## Caveats

- **Send/Sync gaps are viral**: adding a raw pointer or `Rc` to a struct silently strips `Send + Sync` from the entire type. The compiler won't warn — you'll discover it when `tokio::spawn` refuses your type.
- **`MutexGuard` is `!Send`**: don't hold a guard across an `.await` point in async code; use `std::mem::drop(guard)` or a block scope before `.await`.
- **Trait objects need `dyn`**: writing `Box<MyTrait>` without `dyn` is a hard error in Rust 2021+. Always write `Box<dyn MyTrait>`.
- **`impl Trait` in return is single-type**: you cannot return different concrete types from different branches (e.g., `if cond { 42 } else { "hello" }` won't compile). Use `Box<dyn Trait>` or an enum for type heterogeneity.
- **GAT where-clauses**: GAT associated types often need `where Self: 'a` bounds that aren't obvious. If the compiler complains about lifetimes, add `where Self: 'a` to the associated type.
- **Lifetime elision in traits**: `fn foo(&self) -> &str` elides to `fn foo<'a>(&'a self) -> &'a str`. If you need the output lifetime to differ from `&self`, name it explicitly: `fn foo<'a>(&self, s: &'a str) -> &'a str`.

## Composition Hints
- **Send + Sync auditing**: when writing a library type that wraps raw pointers or FFI, gate `Send`/`Sync` manually: `unsafe impl<T: Send> Send for MyType<T> {}`. Always add a safety comment explaining why.
- **Choose static dispatch by default**: use `<T: Trait>` or `impl Trait` unless you specifically need heterogeneous storage or type erasure. The compiler optimizes monomorphized code better.
- **Supertraits express requirements**: `trait Circle: Shape` makes `Shape` methods available on `Circle` trait objects and enforces the dependency at the impl site.
- **Non-dispatchable methods are fine**: a dyn-compatible trait can still have `where Self: Sized` methods — they just can't be called through `&dyn Trait`. Use this for constructors, generic helpers, or methods returning `Self`.
- **GAT for lending iterators**: the canonical use case is a trait that returns an iterator borrowing from `self` with a per-call lifetime. Without GAT you'd need a named lifetime on the trait itself, preventing multiple calls.
