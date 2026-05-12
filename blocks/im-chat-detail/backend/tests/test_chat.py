from __future__ import annotations

from datetime import datetime, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import User
from app.ulid_utils import new_ulid


async def _make_user(s: AsyncSession, name: str, bio: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    uid = new_ulid()
    s.add(User(id=uid, name=name, bio=bio, online_status="online",
               created_at=now, updated_at=now))
    await s.flush()
    return uid


async def _pair(engine: AsyncEngine) -> tuple[str, str]:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        me = await _make_user(s, "Alice", "测试用户 A")
        peer = await _make_user(s, "Bob", "测试用户 B")
        await s.commit()
    return me, peer


async def test_get_peer(client: AsyncClient, engine: AsyncEngine) -> None:
    me, peer = await _pair(engine)
    r = await client.get(f"/v1/peers/{peer}", headers={"X-Dev-User-Id": me})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Bob"
    assert body["bio"] == "测试用户 B"


async def test_get_unknown_peer_404(client: AsyncClient, engine: AsyncEngine) -> None:
    me, _ = await _pair(engine)
    r = await client.get(f"/v1/peers/{new_ulid()}", headers={"X-Dev-User-Id": me})
    assert r.status_code == 404


async def test_peer_requires_auth(client: AsyncClient, engine: AsyncEngine) -> None:
    _, peer = await _pair(engine)
    r = await client.get(f"/v1/peers/{peer}")
    assert r.status_code == 401


async def test_send_message_and_list(client: AsyncClient, engine: AsyncEngine) -> None:
    me, peer = await _pair(engine)
    r = await client.post(
        "/v1/messages",
        headers={"X-Dev-User-Id": me},
        json={"recipient_id": peer, "content": {"kind": "text", "text": "hi"}},
    )
    assert r.status_code == 201
    assert r.json()["content"]["text"] == "hi"
    assert r.json()["sender_id"] == me
    assert r.json()["recipient_id"] == peer

    # Both sides should see the same message via list endpoint.
    listing_me = await client.get(
        f"/v1/messages/with/{peer}", headers={"X-Dev-User-Id": me}
    )
    listing_peer = await client.get(
        f"/v1/messages/with/{me}", headers={"X-Dev-User-Id": peer}
    )
    assert len(listing_me.json()["items"]) == 1
    assert len(listing_peer.json()["items"]) == 1


async def test_list_cursor_pagination(client: AsyncClient, engine: AsyncEngine) -> None:
    me, peer = await _pair(engine)
    for i in range(15):
        await client.post(
            "/v1/messages",
            headers={"X-Dev-User-Id": me},
            json={"recipient_id": peer, "content": {"kind": "text", "text": f"msg-{i}"}},
        )
    page1 = await client.get(
        f"/v1/messages/with/{peer}?limit=10", headers={"X-Dev-User-Id": me}
    )
    body1 = page1.json()
    assert len(body1["items"]) == 10
    assert body1["has_more"] is True
    page2 = await client.get(
        f"/v1/messages/with/{peer}?limit=10&cursor={body1['next_cursor']}",
        headers={"X-Dev-User-Id": me},
    )
    body2 = page2.json()
    assert len(body2["items"]) == 5
    assert body2["has_more"] is False


async def test_send_to_nonexistent_peer_404(client: AsyncClient, engine: AsyncEngine) -> None:
    me, _ = await _pair(engine)
    r = await client.post(
        "/v1/messages",
        headers={"X-Dev-User-Id": me},
        json={"recipient_id": new_ulid(), "content": {"kind": "text", "text": "ghost"}},
    )
    assert r.status_code == 404
    assert r.json()["code"] == "peer.not_found"


async def test_mark_read(client: AsyncClient, engine: AsyncEngine) -> None:
    me, peer = await _pair(engine)
    # Peer sends message to me
    r = await client.post(
        "/v1/messages",
        headers={"X-Dev-User-Id": peer},
        json={"recipient_id": me, "content": {"kind": "text", "text": "yo"}},
    )
    msg_id = r.json()["id"]
    # I mark it read
    r = await client.post(
        f"/v1/messages/with/{peer}/read",
        headers={"X-Dev-User-Id": me},
        json={"up_to_message_id": msg_id},
    )
    assert r.status_code == 204
    listing = await client.get(
        f"/v1/messages/with/{peer}", headers={"X-Dev-User-Id": me}
    )
    assert listing.json()["items"][0]["status"] == "read"


async def test_recall_own_message(client: AsyncClient, engine: AsyncEngine) -> None:
    me, peer = await _pair(engine)
    r = await client.post(
        "/v1/messages",
        headers={"X-Dev-User-Id": me},
        json={"recipient_id": peer, "content": {"kind": "text", "text": "oops"}},
    )
    msg_id = r.json()["id"]
    r2 = await client.post(
        f"/v1/messages/{msg_id}/recall", headers={"X-Dev-User-Id": me}
    )
    assert r2.status_code == 200
    assert r2.json()["content"]["kind"] == "recall"
    assert r2.json()["deleted_at"] is not None


async def test_recall_others_message_rejected(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    me, peer = await _pair(engine)
    r = await client.post(
        "/v1/messages",
        headers={"X-Dev-User-Id": peer},
        json={"recipient_id": me, "content": {"kind": "text", "text": "stay"}},
    )
    msg_id = r.json()["id"]
    r2 = await client.post(
        f"/v1/messages/{msg_id}/recall", headers={"X-Dev-User-Id": me}
    )
    assert r2.status_code == 422
    assert r2.json()["code"] == "message.not_sender"


async def test_messages_require_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/v1/messages",
        json={"recipient_id": new_ulid(), "content": {"kind": "text", "text": "hi"}},
    )
    assert r.status_code == 401
