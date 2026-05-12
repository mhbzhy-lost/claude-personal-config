# Domain model reference — im-chat-detail

Human-readable companion to `openapi.yaml`. If the wire format diverges
from this document, the YAML is authoritative — fix this file.

## User

| Field      | Type    | Notes |
|---|---|---|
| id         | ULID    |       |
| name       | string  |       |
| avatar_url | string? |       |

## Problem (RFC 7807)

Same as other blocks. See openapi.yaml `#/components/schemas/Problem`.

## TODO: Domain entities

Define your domain entities here following the pattern from
`blocks/im-conversation-list/protocol/types.md` or
`blocks/commerce-product-list/protocol/types.md`.
