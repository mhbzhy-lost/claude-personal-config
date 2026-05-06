---
name: api-discovery-endpoint-inventory
description: Aggregate, normalize, and deduplicate API endpoints from multiple discovery sources into a unified inventory with diffing support.
tech_stack: [web]
capability: [api-design]
version: "OpenAPI 3.0"
collected_at: 2025-07-16
---

# API Endpoint Inventory

> Source: https://swagger.io/docs/specification/v3_0/paths-and-operations/

## Purpose

Build a unified, deduplicated API endpoint inventory by aggregating raw endpoint data from heterogeneous discovery sources — Swagger/OpenAPI schemas, GraphQL introspection, browser network captures, and path fuzzing results — into a single canonical listing of `METHOD + PATH` combinations with their metadata.

## When to Use

- After running multiple API discovery techniques and needing a single source of truth
- To normalize endpoints from sources that use different path conventions (trailing slashes, parameter styles, version prefixes)
- When auditing an internal system's API surface to detect undocumented, deprecated, or shadow endpoints
- To diff endpoint inventories across time and catch new, changed, or removed endpoints
- Before writing a formal OpenAPI specification for an undocumented internal service

## Basic Usage

### 1. Normalization Rules

Apply these canonicalization rules to every raw `method + path` pair before inserting into inventory:

| Rule | Example |
|------|---------|
| Lowercase method | `GET`, not `Get` |
| Strip trailing slash | `/users/` → `/users` |
| Collapse path parameters to `{param}` | `/users/123` → `/users/{id}` |
| Collapse version prefixes to unified notation | `/v1/users`, `/v2/users` → note both versions |
| Sort query params alphabetically | `?b=2&a=1` → `?a=1&b=2` |
| Remove default ports | `:80` / `:443` |
| Deduplicate on `METHOD PATH` (no query) | `GET /users` is unique; query params are metadata |

### 2. Inventory Output Formats

**Markdown table (human-readable):**
```markdown
| Method | Path | Source | Parameters | Auth | Deprecated |
|--------|------|--------|------------|------|------------|
| GET | /users/{id} | swagger | id (path) | Bearer | no |
| POST | /users | network-capture | body: User | Bearer | no |
| GET | /admin/debug | fuzzing | — | none | — |
```

**JSON schema (machine-readable):**
```json
{
  "endpoints": [
    {
      "method": "GET",
      "path": "/users/{id}",
      "sources": ["swagger", "network-capture"],
      "parameters": [{"name": "id", "in": "path", "required": true}],
      "auth_required": true,
      "deprecated": false,
      "first_seen": "2025-07-16",
      "last_seen": "2025-07-16"
    }
  ]
}
```

### 3. Diffing Strategy

Compare two inventory snapshots to detect:
- **New endpoints:** present in current, absent in previous
- **Removed endpoints:** absent in current, present in previous
- **Changed endpoints:** same `METHOD PATH` but different parameters, auth, or deprecation status

Use `operationId` from OpenAPI specs as the stable identifier when available; fall back to `METHOD PATH` hash.

## Key APIs (Summary)

### Path Normalization Core

| Operation | Input | Output |
|-----------|-------|--------|
| Canonicalize path | `/USERS/{ID}/` | `/users/{id}` |
| Extract path params | `/users/5/orders/42` | `{user_id: 5, order_id: 42}` |
| Collapse to template | `/users/5/orders/42` | `/users/{userId}/orders/{orderId}` |
| Version-aware grouping | `/v1/users`, `/v2/users` | Group under `/users` with `versions: [v1, v2]` |
| Merge duplicate | Two sources report `GET /users` | Single entry, `sources: [swagger, fuzzing]` |

### OpenAPI Path Structure (reference format)

Paths are defined in the global `paths` section. Each path supports operations (`get`, `post`, `put`, `patch`, `delete`, `head`, `options`, `trace`). A unique operation is `PATH + HTTP METHOD` — parameters do not affect uniqueness. Paths use `{curly}` braces for templated parameters.

## Caveats

- **Query strings are NOT part of path identity:** `GET /users?role=admin` and `GET /users?role=user` are the same endpoint. Query params are metadata on the `GET /users` entry.
- **Two GET/POST for the same path are illegal in OpenAPI**, but may appear in raw capture data. Flag as anomalous.
- **Parameter collision:** When merging, parameters with same name but different types or locations (query vs header) should both be preserved and flagged.
- **operationId uniqueness is per-API, not global:** Don't use operationId as a cross-service key without namespacing.
- **Server URL variability:** The same path may appear under different base URLs. Normalize to relative paths and track `server_url` as metadata.
- **Deprecated ≠ removed:** Keep deprecated endpoints in inventory but mark them; they may still be reachable.

## Composition Hints

- **Feeds from:** `api-discovery-swagger-openapi-probing` (parsed OpenAPI paths), `api-discovery-graphql-introspection` (generated query/mutation templates), `api-discovery-network-tab-capture` (captured XHR/Fetch traffic), `api-discovery-endpoint-fuzzing` (ffuf/wfuzz output)
- **Feeds into:** Write the inventory as a living document; re-run after each discovery phase and diff against the previous snapshot
- **Complementary skills:** Use `api-discovery-mobile-mitmproxy` to add mobile-only endpoints that don't appear in browser captures
