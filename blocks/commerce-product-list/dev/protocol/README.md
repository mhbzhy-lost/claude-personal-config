# Protocol

Contract layer for `commerce-product-list`. Source of truth for both
frontend and backend.

## Files

| File | Purpose |
|---|---|
| `openapi.yaml` | REST API (OpenAPI 3.1) |
| `types.md` | Domain model reference (human-readable) |

No AsyncAPI — this block has no real-time channel.

## Conventions

Same as `im-conversation-list/protocol`:
- **IDs**: ULID
- **Timestamps**: ISO 8601 UTC `Z`
- **Errors**: RFC 7807 Problem Details
- **Auth**: Bearer JWT (pluggable on backend)

## Differences from im-conversation-list

- **Pagination**: offset + limit (not cursor). Justified because products
  have stable identity and ordering; users browse without high churn.
- **Sort**: client-selectable via `sort` query param. Five axes:
  `price_asc / price_desc / sold_desc / created_desc / rating_desc`.
  Default: `created_desc`.
- **Filters**: multi-dimensional via query params (category, price_min,
  price_max, in_stock_only).
- **No WebSocket**: data is pull-only. Stock/price updates surface on
  next refresh.
