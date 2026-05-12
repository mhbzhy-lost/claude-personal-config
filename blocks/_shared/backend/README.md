# Backend — {{SLUG}}

FastAPI service for the {{TITLE_EN}} block. Scaffolded from
`blocks/_shared/backend/`.

## Quickstart

```bash
cp .env.example .env
make db-up                 # postgres on :{{POSTGRES_PORT}}
make migrate               # apply schema
make seed-demo             # populate demo data
make dev                   # uvicorn :{{BACKEND_PORT}}
```

Open http://localhost:{{BACKEND_PORT}}/docs for Swagger.

## Next steps for the developer

1. Define your protocol in `../protocol/openapi.yaml`
2. Add domain models in `app/models/`
3. Generate alembic migration: `alembic revision --autogenerate -m 'add domain'`
4. Add pydantic schemas in `app/schemas/`
5. Add services in `app/services/`
6. Add routes in `app/api/v1/`
7. Extend `app/scripts/seed.py` with domain data
8. Update `tests/conftest.py` `TRUNCATE_TABLES` with new table names
9. Write domain tests in `tests/`

Reference: `blocks/im-conversation-list/` (with WebSocket) or
`blocks/commerce-product-list/` (HTTP only).
