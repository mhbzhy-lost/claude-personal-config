from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import UserConversationState
from app.ulid_utils import new_ulid
from tests._helpers import (
    add_message,
    make_direct_conversation,
    make_user,
    setup_pair,
)


async def test_get_conversation(client: AsyncClient, engine: AsyncEngine) -> None:
    me, _peer, cid = await setup_pair(engine)
    r = await client.get(f"/v1/conversations/{cid}", headers={"X-Dev-User-Id": me})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == cid
    assert body["unread_count"] == 0


async def test_get_conversation_not_found(client: AsyncClient, engine: AsyncEngine) -> None:
    me, _peer, _cid = await setup_pair(engine)
    r = await client.get(
        f"/v1/conversations/{new_ulid()}",
        headers={"X-Dev-User-Id": me},
    )
    assert r.status_code == 404
    assert r.json()["code"] == "conversation.not_found"


async def test_patch_pin_then_unpin(client: AsyncClient, engine: AsyncEngine) -> None:
    me, _peer, cid = await setup_pair(engine)

    r = await client.patch(
        f"/v1/conversations/{cid}",
        headers={"X-Dev-User-Id": me},
        json={"is_pinned": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["is_pinned"] is True
    assert body["pinned_at"] is not None

    r = await client.patch(
        f"/v1/conversations/{cid}",
        headers={"X-Dev-User-Id": me},
        json={"is_pinned": False},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["is_pinned"] is False
    assert body["pinned_at"] is None


async def test_patch_pinned_cap_exceeded(client: AsyncClient, engine: AsyncEngine) -> None:
    """Pin one beyond the configured cap (default 200, lower for the test)."""
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        me = await make_user(s, "Me")
        peer = await make_user(s, "Peer")
        cids = []
        for i in range(3):
            cid = await make_direct_conversation(
                s, me, peer, last_activity_offset_minutes=i, pinned_for=me
            )
            cids.append(cid)
        cid_to_pin = await make_direct_conversation(s, me, peer, last_activity_offset_minutes=10)
        await s.commit()

    client._transport.app.state.settings.pinned_cap_per_user = 3  # type: ignore[attr-defined]

    r = await client.patch(
        f"/v1/conversations/{cid_to_pin}",
        headers={"X-Dev-User-Id": me},
        json={"is_pinned": True},
    )
    assert r.status_code == 422
    assert r.json()["code"] == "pin.cap_exceeded"


async def test_delete_removes_from_list(client: AsyncClient, engine: AsyncEngine) -> None:
    me, _peer, cid = await setup_pair(engine)

    r = await client.delete(f"/v1/conversations/{cid}", headers={"X-Dev-User-Id": me})
    assert r.status_code == 204

    r = await client.get("/v1/conversations", headers={"X-Dev-User-Id": me})
    assert r.status_code == 200
    assert all(c["id"] != cid for c in r.json()["items"])


async def test_mark_read_clears_unread(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        me = await make_user(s, "Me")
        peer = await make_user(s, "Peer")
        cid = await make_direct_conversation(s, me, peer, unread_for={me: 3})
        m1 = await add_message(s, conversation_id=cid, sender_id=peer, text="one")
        m2 = await add_message(s, conversation_id=cid, sender_id=peer, text="two")
        m3 = await add_message(s, conversation_id=cid, sender_id=peer, text="three")
        await s.commit()

    r = await client.post(
        f"/v1/conversations/{cid}/read",
        headers={"X-Dev-User-Id": me},
        json={"up_to_message_id": m3},
    )
    assert r.status_code == 204

    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        from sqlalchemy import select
        ucs = (
            await s.execute(
                select(UserConversationState).where(
                    UserConversationState.user_id == me,
                    UserConversationState.conversation_id == cid,
                )
            )
        ).scalar_one()
        assert ucs.unread_count == 0
        assert ucs.last_read_message_id == m3
        del m1, m2  # silence unused


async def test_search_matches_title(client: AsyncClient, engine: AsyncEngine) -> None:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        me = await make_user(s, "Me")
        peer = await make_user(s, "Peer")
        await make_direct_conversation(s, me, peer, title="Project Aurora")
        await make_direct_conversation(s, me, peer, title="Lunch plans", last_activity_offset_minutes=1)
        await s.commit()

    r = await client.get(
        "/v1/conversations/search",
        params={"q": "Aurora"},
        headers={"X-Dev-User-Id": me},
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "Project Aurora"
