from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from tests._helpers import make_product, make_user, seed_user_and_products


async def test_list_anonymous_no_user_state(client: AsyncClient, engine: AsyncEngine) -> None:
    await seed_user_and_products(engine, n=3)
    r = await client.get("/v1/products")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3
    assert all(item["user_state"] is None for item in body["items"])


async def test_list_pagination(client: AsyncClient, engine: AsyncEngine) -> None:
    await seed_user_and_products(engine, n=25)
    r1 = await client.get("/v1/products?page=1&page_size=10")
    r2 = await client.get("/v1/products?page=3&page_size=10")
    assert r1.json()["has_more"] is True
    assert r2.json()["has_more"] is False
    assert r2.json()["page"] == 3
    assert len(r2.json()["items"]) == 5


async def test_list_sort_price_asc(client: AsyncClient, engine: AsyncEngine) -> None:
    await seed_user_and_products(engine, n=5)
    r = await client.get("/v1/products?sort=price_asc")
    prices = [item["price"] for item in r.json()["items"]]
    assert prices == sorted(prices)


async def test_list_filter_category(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        await make_user(s)
        await make_product(s, category="electronics/phones")
        await make_product(s, category="electronics/phones")
        await make_product(s, category="clothing/men")
        await s.commit()
    r = await client.get("/v1/products?category=electronics/phones")
    assert r.json()["total"] == 2


async def test_list_filter_price_range(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        await make_user(s)
        await make_product(s, price=500)
        await make_product(s, price=1500)
        await make_product(s, price=2500)
        await s.commit()
    r = await client.get("/v1/products?price_min=1000&price_max=2000")
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["price"] == 1500


async def test_list_filter_in_stock_only(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        await make_user(s)
        await make_product(s, stock=0)
        await make_product(s, stock=5)
        await s.commit()
    r = await client.get("/v1/products?in_stock_only=true")
    assert r.json()["total"] == 1


async def test_list_search_q(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        await make_user(s)
        await make_product(s, name="Aurora Phone Plus")
        await make_product(s, name="Borealis Tablet")
        await s.commit()
    r = await client.get("/v1/products?q=aurora")
    assert r.json()["total"] == 1
    assert "Aurora" in r.json()["items"][0]["name"]


async def test_list_authenticated_user_state_joined(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    uid, pids = await seed_user_and_products(engine, n=2)
    # Favorite product[0]
    await client.put(
        f"/v1/products/{pids[0]}/favorite",
        headers={"X-Dev-User-Id": uid},
        json={"is_favorite": True},
    )
    r = await client.get("/v1/products", headers={"X-Dev-User-Id": uid})
    items_by_id = {item["id"]: item for item in r.json()["items"]}
    assert items_by_id[pids[0]]["user_state"]["is_favorite"] is True
    assert items_by_id[pids[1]]["user_state"] is None
