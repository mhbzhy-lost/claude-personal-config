# Protocol

The contract layer for `im-conversation-list`. **Source of truth** for both
frontend and backend.

## Files

| File              | Purpose                                  |
|-------------------|------------------------------------------|
| `openapi.yaml`    | REST API (OpenAPI 3.1)                   |
| `asyncapi.yaml`   | WebSocket events (AsyncAPI 3.0)          |
| `types.md`        | Domain model reference (human-readable)  |

## Code generation

```bash
make install       # one-time: pnpm install
make gen           # → generated/openapi.ts (types) + generated/zodios.ts (zod + client)
make lint          # spectral lint openapi.yaml
make clean         # remove generated/ + node_modules/
```

Outputs are committed (treated as build artifacts you want diffable).
Frontend imports from `protocol/generated/` directly.

### What's generated
| File | Contents | Tool |
|---|---|---|
| `generated/openapi.ts` | TypeScript types for paths, operations, components | `openapi-typescript` |
| `generated/zodios.ts` | Zod schemas + `Zodios` typed REST client | `openapi-zod-client` |

### Backend pydantic generation (deferred)
Backend currently uses **hand-written** pydantic models (`backend/app/schemas/`)
that mirror this contract. Auto-gen for pydantic is harder (less mature tools,
need to preserve discriminator unions / `model_config`); deferred to v1.0.
For now, the contract test enforces alignment by hitting endpoints from frontend's
generated zod validators (TODO).

## Versioning policy

- Path prefix carries major version: `/v1/conversations`
- Breaking changes require a new major path AND a deprecation window of one minor
- WS event schemas embed `event_version: int` for forward compat

## Conventions

- **IDs**: ULID strings (`01H...`, 26 chars). Sortable, URL-safe.
- **Timestamps**: ISO 8601 with `Z` suffix, always UTC at the wire.
- **Pagination**: cursor-based. `?cursor=&limit=` → `{items, next_cursor}`.
  No offset pagination — list is bumped by activity, offsets would skip items.
- **Errors**: RFC 7807 Problem Details.
- **Auth**: Bearer JWT (pluggable on backend; protocol just declares the scheme).
- **Idempotency**: write endpoints accept `Idempotency-Key` header.

## Sort order (server-controlled)

`conversations` list is always sorted:
1. `is_pinned DESC` (pinned items first)
2. Within pinned group: `pinned_at DESC`
3. Within unpinned group: `last_activity_at DESC`

Clients should not re-sort.
