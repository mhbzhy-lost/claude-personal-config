# Backend — im-conversation-list

FastAPI service implementing the protocol defined in `../protocol/`.

## Quickstart

```bash
cp .env.example .env       # adjust if needed
make db-up                 # start postgres in docker (compose)
make migrate               # apply schema
make seed-demo             # populate with ~100 conv / ~3k msg
make dev                   # uvicorn @ :8080 with reload
```

Open http://localhost:8080/docs for the Swagger UI.

### If `docker compose` plugin isn't installed

```bash
docker run -d --name imcl-pg \
  -e POSTGRES_USER=imcl -e POSTGRES_PASSWORD=imcl -e POSTGRES_DB=imcl \
  -p 5544:5432 postgres:17-alpine
docker exec imcl-pg psql -U imcl -d imcl -c "CREATE DATABASE imcl_test OWNER imcl;"
```

then continue with `make migrate && make seed-demo && make dev`.

## Architecture

```
app/
├── api/v1/         # FastAPI routers (1:1 with openapi.yaml paths)
├── services/       # Business logic — independent of HTTP layer
├── models/         # SQLAlchemy 2.0 ORM (async)
├── schemas/        # Pydantic request/response, aligned to OpenAPI
├── ws/             # WebSocket hub (in-process pub/sub)
├── auth.py         # Pluggable auth: dev-mode header OR JWT validation
├── db.py           # Engine + session
├── errors.py       # RFC 7807 Problem Details
└── main.py         # FastAPI app factory
```

### Auth contract
The `get_current_user_id` dependency is the single integration point.
- **dev mode** (`IMCL_AUTH_MODE=dev`): trusts `X-Dev-User-Id` header. Use only for dev / tests.
- **jwt mode**: validates Bearer JWT against `IMCL_JWT_PUBLIC_KEY`.
- **custom**: override the dependency at app startup (see `app/main.py`).

The block does not manage user accounts — your host app does. The block only
needs an authenticated user_id.

### WebSocket
Single channel at `/v1/ws`. Connection-bound to one user (auth at handshake).
Events follow `protocol/asyncapi.yaml`. The hub is in-process; for multi-instance
deployments swap `app/ws/hub.py` with a Redis pub/sub adapter (the interface is
small).

### Pagination
Cursor encoding: opaque base64(JSON). Never expose internals to clients.
For conversations list:
- First page: pinned (all) + unpinned (limit + 1).
- Subsequent pages: unpinned only, cursor over `(last_activity_at, id)`.
- Pinned cap: 200 per user (enforced at pin-time, returns 422 over).

### Idempotency
`POST /messages` accepts `Idempotency-Key`. Replay returns the original 201 body.
TTL: 24h. Backed by a small idempotency table.

## Testing

```bash
make test
```

Tests run against `imcl_test` database (auto-created by docker-compose). Each
test runs in a transaction that is rolled back on teardown — fast and isolated.

## What's deferred (v0.1 → v1.0)

- Full E2E coverage (currently focused on critical paths)
- Idempotency cleanup job
- Multi-instance WS via Redis adapter
- Search via Postgres FTS (currently LIKE-based)
- Rate limiting middleware (placeholder hook present)

See `../../docs/plans/skill-abstraction-experiment-conversation-list.md` §8 for
the full quality bar this service must hit before being declared v1.0.
