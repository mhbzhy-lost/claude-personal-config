from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from app.ulid_utils import new_ulid
from tests._helpers import seed_user_and_products


async def test_set_favorite_toggle(client: AsyncClient, engine: AsyncEngine) -> None:
    uid, pids = await seed_user_and_products(engine, n=1)
    r = await client.put(
        f"/v1/products/{pids[0]}/favorite",
        headers={"X-Dev-User-Id": uid},
        json={"is_favorite": True},
    )
    assert r.status_code == 200
    assert r.json()["is_favorite"] is True
    assert r.json()["favorited_at"] is not None

    r = await client.put(
        f"/v1/products/{pids[0]}/favorite",
        headers={"X-Dev-User-Id": uid},
        json={"is_favorite": False},
    )
    assert r.json()["is_favorite"] is False
    assert r.json()["favorited_at"] is None


async def test_set_cart_count(client: AsyncClient, engine: AsyncEngine) -> None:
    uid, pids = await seed_user_and_products(engine, n=1)
    r = await client.put(
        f"/v1/products/{pids[0]}/cart",
        headers={"X-Dev-User-Id": uid},
        json={"count": 2},
    )
    assert r.status_code == 200
    assert r.json()["cart_count"] == 2


async def test_cart_count_exceeds_stock(client: AsyncClient, engine: AsyncEngine) -> None:
    uid, pids = await seed_user_and_products(engine, n=1)
    # seed_user_and_products makes stock=10 by default
    r = await client.put(
        f"/v1/products/{pids[0]}/cart",
        headers={"X-Dev-User-Id": uid},
        json={"count": 9999},
    )
    assert r.status_code == 422
    assert r.json()["code"] == "cart.stock_insufficient"


async def test_actions_require_auth(client: AsyncClient, engine: AsyncEngine) -> None:
    _uid, pids = await seed_user_and_products(engine, n=1)
    r = await client.put(
        f"/v1/products/{pids[0]}/favorite", json={"is_favorite": True}
    )
    assert r.status_code == 401


async def test_action_on_missing_product(client: AsyncClient, engine: AsyncEngine) -> None:
    uid, _pids = await seed_user_and_products(engine, n=1)
    r = await client.put(
        f"/v1/products/{new_ulid()}/favorite",
        headers={"X-Dev-User-Id": uid},
        json={"is_favorite": True},
    )
    assert r.status_code == 404
    assert r.json()["code"] == "product.not_found"
