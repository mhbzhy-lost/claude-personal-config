---
name: api-discovery-graphql-introspection
description: Discover GraphQL API schemas, types, queries, and mutations via the introspection system and Automatic Persisted Queries
tech_stack: [web]
language: [graphql]
capability: [api-design]
version: "GraphQL Specification (October 2021)"
collected_at: 2025-01-01
---

# GraphQL Introspection & API Discovery

> Source: https://graphql.org/learn/introspection/, https://www.apollographql.com/docs/apollo-server/performance/apq/

## Purpose
Discover the full schema of a GraphQL API at runtime using the introspection system — the primary mechanism for probing unknown GraphQL endpoints. Covers the standard introspection queries (`__schema`, `__type`, `__typename`), how to enumerate types/fields/queries/mutations, and how to use Automatic Persisted Queries (APQ) for efficient high-volume probing.

## When to Use
- Probing an unknown GraphQL endpoint to enumerate all available types, queries, mutations, and fields
- Determining whether a GraphQL API has introspection enabled or disabled (production hardening check)
- Extracting schema documentation (type/field descriptions) from a live endpoint
- Navigating wrapper types (NON_NULL, LIST) to reach the actual inner types
- Reducing request overhead when repeatedly querying the same large introspection payload via APQ
- Building schema-aware tooling that dynamically adapts to any GraphQL API

## Basic Usage

### Quick Probing: Is Introspection Enabled?
```graphql
# Minimal probe — works on EVERY GraphQL endpoint
{ __typename }
```
Always succeeds regardless of introspection settings. If this returns data, the endpoint is live and accepting queries.

### Schema-Wide Discovery
```graphql
# Enumerate every type in the schema
query {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      name
      kind        # SCALAR, OBJECT, INTERFACE, UNION, ENUM, INPUT_OBJECT
      description
    }
  }
}
```
This single query reveals the entire type surface. Filter by `kind` to isolate queries (`OBJECT` named `Query`), mutations, or input types.

### Enumerating All Queries and Mutations
```graphql
# Get every available root field with its args and return type
query {
  __schema {
    queryType {
      fields {
        name
        description
        args { name type { name kind } }
        type { name kind ofType { name kind } }
      }
    }
    mutationType {
      fields { name description }
    }
  }
}
```

### Deep-Diving a Specific Type
```graphql
query {
  __type(name: "User") {
    name
    kind
    description
    fields { name type { name kind ofType { name kind } } }
    interfaces { name }
    possibleTypes { name }   # for unions/interfaces
    enumValues { name }      # for enums
    inputFields { name type { name kind } }  # for input types
  }
}
```

### Handling NON_NULL and LIST Wrappers
Wrapper types (`NON_NULL`, `LIST`) have `null` names. Always query `ofType` to reach the actual scalar/object type:
```graphql
# type { name kind ofType { name kind ofType { name kind } } }
```
Two levels of `ofType` unwrap `[String!]!` (LIST → NON_NULL → SCALAR).

### APQ: Efficient Repeated Probing
When repeatedly hitting the same endpoint with large introspection queries, use APQ to send only a SHA-256 hash after the first request:
```bash
# First request: send both query + hash
curl --get http://localhost:4000/graphql \
  --header 'content-type: application/json' \
  --data-urlencode 'query={__typename}' \
  --data-urlencode 'extensions={"persistedQuery":{"version":1,"sha256Hash":"ecf4edb..."}}'

# Subsequent requests: hash only
curl --get http://localhost:4000/graphql \
  --header 'content-type: application/json' \
  --data-urlencode 'extensions={"persistedQuery":{"version":1,"sha256Hash":"ecf4edb..."}}'
```

## Key APIs (Summary)

| Field / Query | Purpose |
|---|---|
| `__typename` | Always available; returns the type name for any Object/Interface/Union field |
| `__schema` | Root introspection field; access `types`, `queryType`, `mutationType`, `directives` |
| `__type(name:)` | Deep-inspect a single named type: kind, fields, interfaces, enum values, possible types |
| `ofType` | Unwrap LIST and NON_NULL wrapper types to reach the inner type |
| `__TypeKind` enum | `SCALAR`, `OBJECT`, `INTERFACE`, `UNION`, `ENUM`, `INPUT_OBJECT`, `LIST`, `NON_NULL` |
| `extensions.persistedQuery` | APQ protocol: `{version, sha256Hash}` in request extensions |
| `PERSISTED_QUERY_NOT_FOUND` | APQ error code when hash is unknown; client must resend with query string |
| `@cacheControl(maxAge:)` | Apollo directive for CDN cache hints on types/fields |

## Caveats

- **Production introspection is often disabled**: Many GraphQL servers disable `__schema` and `__type` introspection in production as a security measure. `__typename` still works since it's required by spec — use it as a basic liveness probe.
- **Wrapper types**: `NON_NULL` and `LIST` types report `null` for `name`. You must query `ofType` (sometimes nested twice) to reach the actual type name and kind.
- **APQ hash must be exact**: The SHA-256 must be computed over the exact query string (whitespace-sensitive). Any mismatch yields an error, not a cache hit.
- **APQ first-request penalty**: The full query string must be sent at least once per unique query before hashes work. The cache is shared across all clients once populated.
- **APQ + mutations**: Even with `useGETForHashedQueries: true`, mutations still use POST — do not try to force GET for non-idempotent operations.
- **Large schema responses**: Full `__schema { types { ... } }` responses can be enormous. For large APIs, query specific types by name with `__type(name:)` instead of dumping everything.
- **`__typename` on every object**: Spec requires it on Object, Interface, and Union types only. It's not available on scalars or enums.
- **APQ default cache**: Apollo Server's in-memory APQ cache has no TTL by default. In production, configure an external cache with appropriate TTL via `persistedQueries.cache` + `persistedQueries.ttl`.

## Composition Hints
- Pair with **api-discovery-network-tab-capture** to capture introspection queries from real browser traffic and verify endpoint behavior
- When introspection is disabled, fall back to network-tab-capture to observe actual queries the frontend makes
- Use `__typename` as a universal "ping" query — it works on every GraphQL endpoint regardless of introspection settings
- For endpoints behind a CDN, enable APQ with `useGETForHashedQueries: true` to make introspection queries cacheable
- Store discovered schemas as SDL (Schema Definition Language) for documentation and code generation
