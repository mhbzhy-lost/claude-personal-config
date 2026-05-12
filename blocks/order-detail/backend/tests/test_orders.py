from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.ulid_utils import new_ulid
from tests._helpers import make_order, make_user


async def test_list_orders_returns_summary(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        uid = await make_user(s)
        await make_order(s, user_id=uid, line_count=2, age_days=1)
        await make_order(s, user_id=uid, line_count=1, age_days=2, status="paid")
        await s.commit()

    r = await client.get("/v1/orders", headers={"X-Dev-User-Id": uid})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert body["items"][0]["item_count"] == 2  # newer first
    assert body["items"][1]["status"] == "paid"


async def test_list_orders_filter_by_status(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        uid = await make_user(s)
        await make_order(s, user_id=uid, status="pending")
        await make_order(s, user_id=uid, status="delivered")
        await s.commit()

    r = await client.get(
        "/v1/orders", params={"status": "delivered"}, headers={"X-Dev-User-Id": uid}
    )
    assert r.json()["total"] == 1


async def test_get_order_detail_returns_items_and_events(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        uid = await make_user(s)
        oid = await make_order(s, user_id=uid, line_count=3)
        await s.commit()

    r = await client.get(f"/v1/orders/{oid}", headers={"X-Dev-User-Id": uid})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == oid
    assert len(body["items"]) == 3
    assert body["items"][0]["line_no"] == 1
    assert len(body["status_events"]) >= 1
    assert body["status_events"][0]["status"] == "pending"
    assert body["shipping_address"]["country"] == "China"


async def test_get_other_users_order_404(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        owner = await make_user(s, name="Owner")
        intruder = await make_user(s, name="Intruder")
        oid = await make_order(s, user_id=owner)
        await s.commit()

    r = await client.get(f"/v1/orders/{oid}", headers={"X-Dev-User-Id": intruder})
    assert r.status_code == 404


async def test_cancel_pending_order(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        uid = await make_user(s)
        oid = await make_order(s, user_id=uid, status="pending")
        await s.commit()

    r = await client.post(
        f"/v1/orders/{oid}/cancel",
        headers={"X-Dev-User-Id": uid},
        json={"reason": "改主意"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"
    assert r.json()["cancel_reason"] == "改主意"
    events = r.json()["status_events"]
    assert events[-1]["status"] == "cancelled"


async def test_cancel_paid_order_unprocessable(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        uid = await make_user(s)
        oid = await make_order(s, user_id=uid, status="paid")
        await s.commit()

    r = await client.post(f"/v1/orders/{oid}/cancel", headers={"X-Dev-User-Id": uid})
    assert r.status_code == 422
    assert r.json()["code"] == "order.cannot_cancel"


async def test_refund_delivered_order(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        uid = await make_user(s)
        oid = await make_order(s, user_id=uid, status="delivered")
        await s.commit()

    r = await client.post(
        f"/v1/orders/{oid}/refund",
        headers={"X-Dev-User-Id": uid},
        json={"reason": "质量问题，色差严重"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "refunded"
    assert r.json()["refund_reason"] == "质量问题，色差严重"


async def test_refund_pending_order_unprocessable(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        uid = await make_user(s)
        oid = await make_order(s, user_id=uid, status="pending")
        await s.commit()

    r = await client.post(
        f"/v1/orders/{oid}/refund",
        headers={"X-Dev-User-Id": uid},
        json={"reason": "想退但订单未支付，应被拒绝"},
    )
    assert r.status_code == 422
    assert r.json()["code"] == "order.cannot_refund"


async def test_endpoints_require_auth(client: AsyncClient) -> None:
    r = await client.get("/v1/orders")
    assert r.status_code == 401
    r = await client.get(f"/v1/orders/{new_ulid()}")
    assert r.status_code == 401
