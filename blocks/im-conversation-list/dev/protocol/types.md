# Domain model reference

Human-readable companion to `openapi.yaml` / `asyncapi.yaml`. If wire formats
diverge from this document, the YAML is authoritative — fix this file.

## User

A participant in the system. Minimal projection used inside conversations.

| Field         | Type     | Notes                                |
|---------------|----------|--------------------------------------|
| id            | ULID     | Globally unique                      |
| name          | string   | Display name                         |
| avatar_url    | string?  | Optional, omit if no avatar set      |
| online_status | enum     | `online` / `offline` / `away` / null |

`online_status` is null when presence tracking is disabled or unknown.

## Conversation

A logical thread between participants. Supports 1-on-1 and group.

| Field             | Type           | Notes                                          |
|-------------------|----------------|------------------------------------------------|
| id                | ULID           |                                                |
| type              | enum           | `direct` / `group`                             |
| title             | string?        | Group only; for direct, derive from peer name  |
| avatar_url        | string?        | Group only; for direct, derive from peer       |
| participants      | User[]         | Capped projection (e.g. top 5 + count)         |
| participant_count | int            | Total count, useful when `participants` capped |
| last_message      | Message?       | Most recent; null if just-created and empty    |
| unread_count      | int            | Per current user                               |
| is_pinned         | bool           | Per current user                               |
| is_muted          | bool           | Per current user                               |
| pinned_at         | timestamp?     | Set when is_pinned=true                        |
| last_activity_at  | timestamp      | Used for sort                                  |
| created_at        | timestamp      |                                                |
| updated_at        | timestamp      | Bumped on any field change                     |

**Per-user fields** (`unread_count`, `is_pinned`, `is_muted`, `pinned_at`) come
from a separate `user_conversation_state` join — pinning/muting is per-user,
not global. Backend joins this on read.

## Message

| Field            | Type        | Notes                                          |
|------------------|-------------|------------------------------------------------|
| id               | ULID        |                                                |
| conversation_id  | ULID        |                                                |
| sender           | User        | Compact projection                             |
| content          | Content     | Tagged union (see below)                       |
| client_id        | string?     | Sender-supplied dedup key                      |
| status           | enum        | `sending` / `sent` / `delivered` / `read` / `failed` |
| sent_at          | timestamp   |                                                |
| edited_at        | timestamp?  |                                                |
| deleted_at       | timestamp?  | Soft delete; content replaced with placeholder |

### Content (tagged union by `kind`)

```
ContentText:    { kind: "text",    text: string }
ContentImage:   { kind: "image",   url: string, width?: int, height?: int, alt?: string }
ContentFile:    { kind: "file",    url: string, name: string, size: int, mime: string }
ContentSystem:  { kind: "system",  code: string, params: object }   // e.g. "user_joined"
ContentRecall:  { kind: "recall",  recall_of: ULID }                // 撤回占位
```

Add new kinds via additive enum extension (do not repurpose `kind` values).

## Cursor page

Standard envelope for paginated lists.

```
CursorPage<T>: {
  items: T[],
  next_cursor: string | null,
  has_more: bool,
}
```

`next_cursor` is opaque — never parse client-side.

## Problem (RFC 7807)

```
Problem: {
  type: string (URI),
  title: string,
  status: int,
  detail?: string,
  instance?: string,
  // domain extensions
  code?: string,    // e.g. "conversation.not_found"
  errors?: object,  // field-level, for 422
}
```
