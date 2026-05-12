# commerce-product-list

Second seed block in the agent-native business component library.
A production-grade pattern for **e-commerce product catalog with grid
layout, multi-dimensional filtering, sort, search, and per-user
state (favorite / cart count)**.

Built as a **deliberate contrast to `im-conversation-list`** to test
whether the block template generalizes across business patterns:

| Variable | im-conversation-list | commerce-product-list |
|---|---|---|
| Real-time | WebSocket + 7 events | **None** (pull-only) |
| Pagination | Cursor | **Offset + limit** |
| Layout | Vertical list | **Responsive grid** |
| Per-user state | pin / mute / delete | favorite / cart count |
| Sort axes | server-controlled | **client-selectable** (5 options) |

If the same scaffold works for both, the model replicates and we can
template it. If it breaks, the breaks tell us what to abstract into
`blocks/_shared/`.

## Structure

```
commerce-product-list/
├── protocol/      # OpenAPI contract, shared types
├── backend/       # FastAPI service implementing the protocol
├── frontend/      # React component + hook + SKILL.md
└── README.md      # This file
```

## Status

| Layer | Status |
|---|---|
| protocol | in progress |
| backend  | not started |
| frontend | not started |

## When NOT to use this block

- 单条商品详情页（用 `commerce-product-detail` block，待建）
- 购物车/结算（用 `commerce-cart-checkout` block，待建）
- 商品搜索引擎（带复杂 facet 聚合）→ 用 algolia/elasticsearch 直连
- < 10 件商品的极简场景 → 直接 antd `<List>` 手写更短
