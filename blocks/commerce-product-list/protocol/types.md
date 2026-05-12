# Domain model reference

## Product

| Field | Type | Notes |
|---|---|---|
| id | ULID | |
| name | string (≤200) | |
| description | string? (≤2000) | optional short blurb |
| price | int | stored in **cents** to avoid float issues |
| currency | string (3) | ISO 4217, e.g. "CNY" / "USD" |
| original_price | int? | for display crossed-out price (sale UX) |
| cover_image | string (URI) | primary image, required for grid |
| images | string[] | additional images, up to 9 |
| stock | int | ≥ 0; 0 means out of stock |
| sold_count | int | aggregate counter (denormalized) |
| rating | float? | 0–5, null if no reviews yet |
| rating_count | int | number of reviews |
| category | string | top-level taxonomy (e.g. "clothing/men") |
| tags | string[] | up to 10 |
| created_at | timestamp | |
| updated_at | timestamp | |

`price` and `original_price` are integers in the smallest currency unit
(cents/分). Frontend formats display.

## UserProductState (per-user)

| Field | Type | Notes |
|---|---|---|
| product_id | ULID | |
| user_id | ULID | |
| is_favorite | bool | |
| cart_count | int | ≥ 0; 0 means not in cart |
| favorited_at | timestamp? | when is_favorite was set true |
| updated_at | timestamp | |

Joined on read into `Product.user_state` (optional sub-object).

## ProductWithState

The wire format the list/search endpoints return: `Product` + nested
`user_state` (null when unauthenticated, populated when logged in).

```
ProductWithState: Product + { user_state: UserProductState | null }
```

## Pagination

Offset-based:

```
{
  items: ProductWithState[],
  total: int,
  page: int,
  page_size: int,
  has_more: bool
}
```

Why not cursor: stable ordering by sort key + low churn; users want to
jump to page N (e.g. "view page 5"). For "infinite scroll" UX,
frontend just bumps `page`.

## Filter & Sort (query params)

| Param | Values | Default |
|---|---|---|
| q | search query, full-text on name + description | (none) |
| category | string (top-level taxonomy) | (none) |
| price_min | int (cents) | (none) |
| price_max | int (cents) | (none) |
| in_stock_only | "true" / "false" | "false" |
| sort | `price_asc` / `price_desc` / `sold_desc` / `created_desc` / `rating_desc` | `created_desc` |
| page | int ≥ 1 | 1 |
| page_size | int 1–100 | 20 |

## Problem (RFC 7807)

Same as `im-conversation-list/protocol`.
