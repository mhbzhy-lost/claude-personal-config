from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.ulid_utils import new_ulid
from tests._helpers import make_user


async def test_me_returns_current_user(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        me = await make_user(s, "Alice")
        await s.commit()

    r = await client.get("/v1/me", headers={"X-Dev-User-Id": me})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == me
    assert body["name"] == "Alice"


async def test_me_404_for_unknown_user(client: AsyncClient) -> None:
    r = await client.get("/v1/me", headers={"X-Dev-User-Id": new_ulid()})
    assert r.status_code == 404
    assert r.json()["code"] == "user.not_found"


async def test_me_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/v1/me")
    assert r.status_code == 401
