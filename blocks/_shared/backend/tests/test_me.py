from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from tests._helpers import make_user


async def test_me_returns_current_user(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        uid = await make_user(s, name="Alice")
        await s.commit()
    r = await client.get("/v1/me", headers={"X-Dev-User-Id": uid})
    assert r.status_code == 200
    assert r.json()["name"] == "Alice"


async def test_me_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/v1/me")
    assert r.status_code == 401
