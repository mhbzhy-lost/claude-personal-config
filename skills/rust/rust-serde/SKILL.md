---
name: rust-serde
description: Serde — Rust's de facto serialization framework. Derive Serialize/Deserialize, customize with attributes, zero-copy borrowing, and format-agnostic data structures.
tech_stack: [backend]
language: [rust]
capability: [api-design]
version: "serde 1.0.x"
collected_at: 2025-01-01
---

# Serde (Serialize + Deserialize)

> Source: https://serde.rs/, https://serde.rs/derive.html, https://serde.rs/custom-serialization.html

## Purpose

Serde is Rust's standard serialization/deserialization framework. It decouples **data structures** (types that impl `Serialize`/`Deserialize`) from **data formats** (crates that impl `Serializer`/`Deserializer`). Define your types once, use them with JSON, YAML, TOML, MessagePack, CBOR, Postcard, and dozens of other formats — all with compile-time generated code and zero runtime reflection overhead.

## When to Use

- Serializing/deserializing Rust structs to/from JSON, YAML, TOML, or any other format.
- Building format-agnostic data types usable across multiple formats.
- HTTP API clients/servers (request/response bodies), config file parsing, IPC, data storage.
- Whenever you need `#[derive(Serialize, Deserialize)]` — which is nearly every Rust project handling data interchange.

## Basic Usage

### Setup

```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

Requires Rust ≥ 1.31 for derive macros.

### Derive

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
struct Point { x: i32, y: i32 }

let point = Point { x: 1, y: 2 };

// Serialize
let json = serde_json::to_string(&point).unwrap();
// → {"x":1,"y":2}

// Deserialize
let parsed: Point = serde_json::from_str(&json).unwrap();
// → Point { x: 1, y: 2 }
```

### Enum Representations

```rust
#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]               // internally tagged: {"type": "A", ...}
enum Message {
    #[serde(rename = "text_msg")]
    Text { content: String },
    Image { url: String, width: u32 },
}

#[derive(Serialize, Deserialize)]
#[serde(untagged)]                    // untagged: try each variant in order
enum Flexible {
    Number(i32),
    Text(String),
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", content = "data")]  // adjacently tagged
enum Event { Click { x: i32, y: i32 }, KeyPress { key: char } }
```

## Key APIs (Summary)

### Essential Attributes

| Attribute | Effect |
|---|---|
| `#[serde(rename = "name")]` | Rename a single field/variant |
| `#[serde(rename_all = "camelCase")]` | Bulk rename: `camelCase`, `snake_case`, `PascalCase`, `SCREAMING_SNAKE_CASE`, `kebab-case` |
| `#[serde(default)]` | Use `Default::default()` when field missing on deserialize |
| `#[serde(default = "fn_name")]` | Custom default function |
| `#[serde(skip)]` | Skip field in both directions |
| `#[serde(skip_serializing)]` | Skip only when serializing |
| `#[serde(skip_deserializing)]` | Skip only when deserializing |
| `#[serde(skip_serializing_if = "Option::is_none")]` | Conditionally skip (e.g., `None` fields) |
| `#[serde(flatten)]` | Inline nested struct's fields into parent |
| `#[serde(borrow)]` | Zero-copy: borrow `&str` / `Cow<'_, str>` from input |
| `#[serde(deny_unknown_fields)]` | Error on unrecognized JSON keys |
| `#[serde(transparent)]` | Newtype: ser/de as the inner type directly |
| `#[serde(tag = "type")]` | Internally tagged enum |
| `#[serde(untagged)]` | Untagged enum (tried in variant order) |
| `#[serde(try_from = "T")]` | Deserialize via `TryFrom<T>` |
| `#[serde(into = "T")]` | Serialize via `Into<T>` |

### Zero-Copy Deserialization

```rust
use std::borrow::Cow;

#[derive(Deserialize)]
struct Data<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,          // borrows &str when possible
    #[serde(borrow)]
    tags: Vec<Cow<'a, str>>,
}
// Only allocates for fields with escape sequences (\n, \uXXXX, etc.)
// Requires a format that supports borrowing (serde_json::from_str — yes; binary formats — no)
```

### Custom Serialize/Deserialize

```rust
use serde::{Serialize, Serializer, Deserialize, Deserializer};

impl Serialize for MyType {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        // Use: s.serialize_struct(), s.serialize_field(), s.serialize_seq(), etc.
    }
}

impl<'de> Deserialize<'de> for MyType {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        // Implement a Visitor and use d.deserialize_struct(), d.deserialize_map(), etc.
    }
}
```

### serde_json Quick Reference

| Function | Signature |
|---|---|
| `to_string` | `to_string<T: Serialize>(&T) -> Result<String>` |
| `to_vec` | `to_vec<T: Serialize>(&T) -> Result<Vec<u8>>` |
| `to_writer` | `to_writer<W: Write, T: Serialize>(W, &T) -> Result<()>` |
| `to_value` | `to_value<T: Serialize>(&T) -> Result<Value>` |
| `from_str` | `from_str<'a, T: Deserialize<'a>>(&'a str) -> Result<T>` |
| `from_slice` | `from_slice<'a, T: Deserialize<'a>>(&'a [u8]) -> Result<T>` |
| `from_reader` | `from_reader<R: Read, T: DeserializeOwned>(R) -> Result<T>` |
| `from_value` | `from_value<T: DeserializeOwned>(Value) -> Result<T>` |
| `json!` macro | `json!({"key": "value", "arr": [1, 2, 3]})` → `Value` |

### Common Format Crates

| Format | Crate | Use Case |
|---|---|---|
| JSON | `serde_json` | HTTP APIs, general interchange |
| YAML | `serde_yaml` | Configuration files |
| TOML | `toml` | Cargo configs, project settings |
| MessagePack | `rmp-serde` | Compact binary, RPC |
| CBOR | `serde_cbor` | IoT, embedded |
| Postcard | `postcard` | `no_std`, embedded, minimal binary |
| RON | `ron` | Human-readable Rust-like syntax |
| BSON | `bson` | MongoDB documents |
| URL-encoded | `serde_urlencoded` | Query strings, form bodies |
| CSV | `csv` | Tabular data |
| Envy | `envy` | Deserialize env vars into structs |

## Caveats

- **`features = ["derive"]` is mandatory** for `#[derive(Serialize, Deserialize)]`. Without it, derive macros are unavailable.
- **Version lock**: All Serde-based deps must share the same major version. `serde 1.0` types are incompatible with `serde 0.9` types — the compiler treats them as different traits. Fix with `cargo tree -d`.
- **Custom `Deserialize` is hard**: Requires the Visitor pattern with `visit_string`, `visit_map`, `visit_seq`, etc. `Serialize` is much simpler.
- **`#[serde(borrow)]`** only works with text-based formats that allow borrowing from input (`serde_json::from_str`). Binary formats like Postcard/Bincode cannot borrow — use owned types instead.
- **`#[serde(flatten)]` + `deny_unknown_fields`** are mutually incompatible — flattened fields are seen as "unknown."
- **Untagged enums**: Variants are tried in declaration order. Order from most to least specific. A partial match can silently consume data for the wrong variant.
- **Serde is format-agnostic** — you always need a format crate alongside. Serde itself only provides the `Serialize`/`Deserialize` traits.
- **Rust ≥ 1.31** required for derive macros.

## Composition Hints

- **One struct, many formats**: Define your data types once with `#[derive(Serialize, Deserialize)]`, then use `serde_json`, `serde_yaml`, `toml`, etc. interchangeably.
- **Axum integration**: Use `Json<T>` extractor (requires `serde::Deserialize` on `T`) and `Json(t).into_response()` (requires `serde::Serialize`).
- **sqlx integration**: Enable `json` feature for `serde_json::Value` column support; derive `sqlx::Type` + `serde::Serialize/Deserialize` for custom JSON column types.
- **Configuration pattern**: Define an `AppConfig` struct with `#[derive(Deserialize)]`, load from file/environment at startup, validate once, then share via `Arc`.
- **API contracts**: Serde attributes (`rename`, `rename_all`, `skip_serializing_if`) let you decouple Rust naming conventions from external API schemas without manual mapping code.
- **Error context**: When deserialization fails, `serde_json::from_str` errors include line/column position. Wrap with `anyhow::Context` to add request-level context.
