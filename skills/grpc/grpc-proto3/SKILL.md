---
name: grpc-proto3
description: Authoring Protocol Buffers in proto3 — messages, enums, well-known types, compatibility rules, and pitfalls.
tech_stack: [grpc]
capability: [api-design, rpc]
version: "protobuf proto3"
collected_at: 2025-07-16
---

# Protocol Buffers — Proto3 Language

> Source: https://protobuf.dev/programming-guides/proto3/, https://protobuf.dev/programming-guides/dos-donts/, https://protobuf.dev/reference/protobuf/proto3-spec/, https://protobuf.dev/reference/protobuf/google.protobuf/

## Purpose

Proto3 is the IDL and wire-format language for Protocol Buffers. Every `.proto`
file declares structured message types, enums, and optionally services. Fields
are identified by immutable integer **field numbers** (1–536,870,911); the
numbers are encoded on the wire, never the names.

## When to Use

- Defining gRPC API contracts and inter-service wire formats.
- Any cross-language, cross-version serialization where backward/forward
  compatibility matters.
- Long-lived schemas that will evolve over years.

**Do NOT** reuse the same message types for both RPC and storage — their
evolution needs diverge. Maintain separate messages with a translation layer.

## Basic Usage

### Minimal message

```proto
syntax = "proto3";

message SearchRequest {
  string query = 1;
  int32 page_number = 2;
  int32 results_per_page = 3;
}
```

`syntax = "proto3";` must be the first non-comment, non-empty line. If omitted,
the compiler assumes proto2.

### Field cardinality

| Label | Behaviour |
|---|---|
| *(none)* | **implicit** — scalar types cannot distinguish unset from default; message types behave like optional. Not recommended. |
| `optional` | Field presence tracked. Unset → returns default, NOT serialized. **Preferred** for maximum compatibility. |
| `repeated` | Zero or more values; order preserved. Scalar numerics use **packed** encoding by default. |
| `map<K,V>` | Key-value pairs; key must be integral or string. |

### Enum pattern — always include UNSPECIFIED

```proto
enum Corpus {
  CORPUS_UNSPECIFIED = 0;   // MUST be zero and first
  CORPUS_UNIVERSAL = 1;
  CORPUS_WEB = 2;
  CORPUS_IMAGES = 3;
}
```

Proto3 **requires** the first enum value to be zero. Convention:
`ENUM_NAME_UNSPECIFIED` or `ENUM_NAME_UNKNOWN`. Never assign semantic meaning to
the zero value — it's the default when a field is unset.

### Reserved fields — delete safely

When removing a field, reserve **both** the number and name:

```proto
message Foo {
  reserved 2, 15, 9 to 11;   // ranges are inclusive
  reserved "foo", "bar";
}
```

Never reuse a field number. Even if the field was deleted years ago, serialized
data may still exist. Reusing numbers causes ambiguous decoding and data
corruption.

### Oneof — mutually exclusive fields

```proto
message SampleMessage {
  oneof test_oneof {
    string name = 4;
    SubMessage sub_message = 9;
  }
}
```

Only one field in a `oneof` can be set at a time. Setting another clears the
previous one.

### Well-Known Types (import from google/protobuf/)

```proto
import "google/protobuf/timestamp.proto";
import "google/protobuf/duration.proto";
import "google/protobuf/field_mask.proto";
import "google/protobuf/empty.proto";

message Event {
  google.protobuf.Timestamp occurred_at = 1;
  google.protobuf.Duration processing_time = 2;
}

service HealthCheck {
  rpc Ping(google.protobuf.Empty) returns (google.protobuf.Empty);
}
```

| WKT | Use | JSON |
|---|---|---|
| `Timestamp` | Point in time (UTC epoch seconds + nanos) | `"2017-01-15T01:30:15.01Z"` |
| `Duration` | Signed time span (±10k years) | `"1.212s"` |
| `FieldMask` | Partial update / projection paths | `"user.displayName,photo"` |
| `Empty` | No-content RPC request/response | `{}` |
| `Any` | Arbitrary typed message | `{"@type":"...", ...}` — prefer extensions |
| `Struct` | Dynamic JSON-like map | JSON object |

**Wrapper types** (`BoolValue`, `Int32Value`, `StringValue`, etc.) are
**obsolete**. Use `optional` scalar fields instead.

### Service definition (for gRPC)

```proto
service SearchService {
  rpc Search(SearchRequest) returns (SearchResponse);
  rpc StreamResults(SearchRequest) returns (stream SearchResponse);
}
```

## Key APIs (Summary)

### Scalar type selection guide

| Need | Use | Why |
|---|---|---|
| Signed integers, negative common | `sint32` / `sint64` | ZigZag encoding, efficient for negatives |
| Unsigned, often large (>2^28) | `fixed32` / `fixed64` | Constant 4/8 bytes, no varint overhead |
| Unsigned, usually small | `uint32` / `uint64` | Variable-length encoding |
| Text | `string` | UTF-8 or 7-bit ASCII, max 2^32 bytes |
| Raw bytes | `bytes` | Arbitrary data, max 2^32 bytes |

### Field-number encoding cost

- **1–15**: 1 byte — use for the most-frequently-set fields.
- **16–2047**: 2 bytes.
- 19,000–19,999: reserved by protobuf implementation.

## Caveats

### Breaking changes — NEVER do these
- **Reuse a field number** — always `reserved` deleted numbers.
- **Change a field type** — exception: `int32` ↔ `uint32` ↔ `int64` ↔ `bool`
  is safe; changing message type breaks unless the new one is a strict superset.
- **Change a field number** — equivalent to delete + new field, breaks wire compat.
- **Go from repeated to scalar** — data loss.
- **Remove an enum value** without reserving its number and name.

### Design pitfalls
- **Booleans that might gain states**: use an enum from day one.
- **Messages with hundreds of fields**: C++ adds ~65 bits per field in memory;
  Java hits method-size limits.
- **C/C++ macro names** (`NULL`, `NAN`, `DOMAIN`) as enum values cause
  compilation errors.
- **Language keywords** as field names — protobuf may mangle them.
- **Text format / JSON for interchange**: renaming fields or enum values breaks
  deserialization. Use **binary** serialization between services.
- **Serialization stability**: NOT guaranteed across builds — don't use for
  cache keys.
- **`Any`**: has known design flaws; prefer extensions for most use cases.

### One message per file
Define one message, enum, service, or cyclic group per `.proto` file. This
prevents dependency bloat and makes refactoring easier.

## Composition Hints

- Always start messages with `optional` fields for future-proofing — implicit
  scalar fields can't evolve to optional later without changing behavior.
- Use `reserved` aggressively when deleting; it's cheap and prevents disasters.
- Put field numbers 1–15 on the highest-traffic fields.
- When adding an enum alias, put the new name last; wait for all parsers to
  update before reordering or removing the old name.
- Keep RPC proto files separate from storage proto files — layer your code with
  a translation boundary.
- Derive `java_package` from the `.proto` package to avoid generated-code
  collisions (e.g., `package x` → `option java_package = "com.example.proto.x";`).
