# {{SLUG}}

{{TITLE_CN}}（{{TITLE_EN}}）business pattern block.

## Structure

```
{{SLUG}}/
├── protocol/      # OpenAPI contract + TS/zod codegen
├── backend/       # FastAPI service implementing the protocol
└── frontend/      # React component + hook + SKILL.md
```

## Status

| Layer | Status |
|---|---|
| protocol | scaffolded (only `/me` boilerplate; add your domain) |
| backend  | scaffolded (only `/me` + `/healthz`; add your domain) |
| frontend | scaffolded (only `BlockClient` + `/me`; build your UI) |

## Next steps

1. Define endpoints in `protocol/openapi.yaml`, run `cd protocol && make gen`
2. Add domain models in `backend/app/models/`
3. Create alembic migration: `cd backend && alembic revision --autogenerate -m 'add domain'`
4. Implement schemas/services/routes in `backend/app/`
5. Extend `backend/app/scripts/seed.py` with domain data
6. Build frontend component in `frontend/src/components/`
7. Write strong-imperative `frontend/SKILL.md`
8. Demo in `frontend/examples/basic/`

参考已就位的两个 block 的实现细节：
- `blocks/im-conversation-list/`（含 WebSocket / cursor 分页 / 列表布局）
- `blocks/commerce-product-list/`（无 WS / offset 分页 / grid 布局）
