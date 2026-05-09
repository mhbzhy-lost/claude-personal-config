# im-conversation-list

A production-grade, end-to-end **business pattern block** for the WeChat-style
conversation list. Designed as the first seed of an agent-native business
component library — the unit of reuse is **frontend + protocol + backend**, not
a single UI component.

## What's in this block

```
im-conversation-list/
├── protocol/      # Contract layer (REST + WebSocket schemas, shared types)
├── backend/       # FastAPI service implementing the protocol
├── frontend/      # React component + hooks + Storybook
├── seed/          # Demo & benchmark data generators
├── examples/      # End-to-end integration samples (Next.js / Vue Taro etc.)
└── README.md      # This file
```

Each layer is **independently usable** but designed against the same protocol —
swap the React frontend for a SwiftUI one and the backend doesn't notice.

## Architecture

```
┌─────────────────┐     REST + WS     ┌─────────────────┐
│  <Conversation  │ <───────────────> │  FastAPI server │
│      List />    │                    │                 │
│                 │   protocol pkg     │  - SQL store    │
│  React + zod    │   (shared types)   │  - WS hub       │
└─────────────────┘                    │  - Auth hook    │
                                       └─────────────────┘
                                              │
                                       ┌──────┴──────┐
                                       │  Postgres   │
                                       │  (or other) │
                                       └─────────────┘
```

The **protocol** package is the source of truth. It generates:
- Pydantic models for the backend
- Zod schemas + TypeScript types for the frontend
- OpenAPI doc for external consumers

Anyone (or any agent) integrating this block reads `protocol/` first and
everything else falls into place.

## Status

| Layer    | Status        | Notes                                                    |
|----------|---------------|----------------------------------------------------------|
| protocol | v0.2 done     | OpenAPI + AsyncAPI + types.md + spectral lint + TS/zod gen |
| backend  | v0.2 runnable | All endpoints + 21 tests pass + 74% coverage             |
| seed     | v0.1 done     | demo (~100 conv/~3k msg) + bench (~1k conv/~150k msg)    |
| frontend | experimental  | Variant A in `experiments/` (not the production frontend) |
| examples | not started   | -                                                        |

**v0.2 != v1.0.** Quality bar in `docs/plans/skill-abstraction-experiment-conversation-list.md` §8
still has open gaps:
- AsyncAPI lint pipeline (only OpenAPI is linted)
- Pydantic auto-generation (hand-written, needs gen + drift check)
- Storybook (when frontend lands here)
- SKILL.md for skills catalog
- Bench / perf baseline runs
- WS event delivery integration test (only handshake auth tested)

## Quality bar

This block must meet the production bar described in
`docs/plans/skill-abstraction-experiment-conversation-list.md` §8 before
its SKILL.md is published into the skills catalog. Anything below that bar
stays in `experiments/`, not here.

## When NOT to use this block (反向选型)

- 单聊客服系统（无多会话语义）→ 用更轻的 chat widget
- 评论流 / 通知中心（线性时间线、无会话分组）→ 用 feed/timeline 模式
- 协作文档评论（嵌入式、上下文锚定）→ 用 inline-comment 模式
- < 5 个会话的极简场景 → 直接用 ant-list + ant-badge 手写更短

If your scenario matches any of the above, this block's abstraction will fight
you, not help you.
