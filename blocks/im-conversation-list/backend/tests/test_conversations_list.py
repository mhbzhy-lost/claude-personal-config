from __future__ import annotations

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import (
    Conversation,
    ConversationParticipant,
    User,
    UserConversationState,
)
from app.ulid_utils import new_ulid


async def _create_minimal(engine: AsyncEngine) -> str:
    """Set up two users + 5 conversations directly via DB. Returns me_id."""
    me_id = new_ulid()
    peer_id = new_ulid()
    now = datetime.now(timezone.utc)

    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        s.add(User(id=me_id, name="Me", created_at=now, updated_at=now))
        s.add(User(id=peer_id, name="Peer", created_at=now, updated_at=now))
        await s.flush()

        convs = []
        for i in range(5):
            cid = new_ulid()
            convs.append(cid)
            s.add(
                Conversation(
                    id=cid,
                    type="direct",
                    last_activity_at=now - timedelta(minutes=i),
                    created_at=now,
                    updated_at=now,
                )
            )
        await s.flush()

        for i, cid in enumerate(convs):
            for uid in (me_id, peer_id):
                s.add(
                    ConversationParticipant(
                        conversation_id=cid, user_id=uid, role="member", joined_at=now
                    )
                )
            s.add(
                UserConversationState(
                    user_id=me_id,
                    conversation_id=cid,
                    is_pinned=(i == 4),
                    pinned_at=now if i == 4 else None,
                    unread_count=i,
                )
            )
            s.add(
                UserConversationState(
                    user_id=peer_id, conversation_id=cid, unread_count=0
                )
            )
        await s.commit()
    return me_id


async def test_list_orders_pinned_first(client: AsyncClient, engine: AsyncEngine) -> None:
    me_id = await _create_minimal(engine)
    r = await client.get("/v1/conversations", headers={"X-Dev-User-Id": me_id})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["items"]) == 5
    assert body["items"][0]["is_pinned"] is True
    assert all(c["is_pinned"] is False for c in body["items"][1:])


async def test_list_returns_unread_only(client: AsyncClient, engine: AsyncEngine) -> None:
    me_id = await _create_minimal(engine)
    r = await client.get(
        "/v1/conversations",
        params={"filter": "unread"},
        headers={"X-Dev-User-Id": me_id},
    )
    assert r.status_code == 200
    body = r.json()
    assert all(c["unread_count"] > 0 for c in body["items"])


async def test_list_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/v1/conversations")
    assert r.status_code == 401
    assert r.headers["content-type"].startswith("application/problem+json")
