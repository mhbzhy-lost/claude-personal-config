# Protocol — order-detail

Contract layer for the Order Detail block. Source of truth for
backend and frontend.

## Files

| File | Purpose |
|---|---|
| `openapi.yaml` | REST API (OpenAPI 3.1) |
| `types.md` | Domain model reference (human-readable) |

## Codegen

```bash
make install
make gen      # → generated/openapi.ts + generated/zodios.ts
make lint     # spectral lint openapi.yaml
```

`generated/` is committed (build artifact you want diffable).

## Conventions

- **IDs**: ULID strings (`01H...`, 26 chars).
- **Timestamps**: ISO 8601 UTC with `Z`.
- **Errors**: RFC 7807 Problem Details.
- **Auth**: Bearer JWT (pluggable on backend).
