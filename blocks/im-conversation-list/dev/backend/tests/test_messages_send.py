from __future__ import annotations

from datetime import datetime, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import (
    Conversation,
    ConversationParticipant,
    User,
    UserConversationState,
)
from app.ulid_utils import new_ulid


async def _setup_pair(engine: AsyncEngine) -> tuple[str, str, str]:
    me_id = new_ulid()
    peer_id = new_ulid()
    conv_id = new_ulid()
    now = datetime.now(timezone.utc)
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        s.add(User(id=me_id, name="Me", created_at=now, updated_at=now))
        s.add(User(id=peer_id, name="Peer", created_at=now, updated_at=now))
        await s.flush()
        s.add(
            Conversation(
                id=conv_id,
                type="direct",
                last_activity_at=now,
                created_at=now,
                updated_at=now,
            )
        )
        await s.flush()
        for uid in (me_id, peer_id):
            s.add(
                ConversationParticipant(
                    conversation_id=conv_id, user_id=uid, role="member", joined_at=now
                )
            )
            s.add(UserConversationState(user_id=uid, conversation_id=conv_id))
        await s.commit()
    return me_id, peer_id, conv_id


async def test_send_text_message(client: AsyncClient, engine: AsyncEngine) -> None:
    me_id, _peer_id, conv_id = await _setup_pair(engine)
    r = await client.post(
        f"/v1/conversations/{conv_id}/messages",
        headers={"X-Dev-User-Id": me_id},
        json={"content": {"kind": "text", "text": "hello"}},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["content"]["kind"] == "text"
    assert body["content"]["text"] == "hello"
    assert body["sender"]["id"] == me_id


async def test_send_idempotent_replay(client: AsyncClient, engine: AsyncEngine) -> None:
    me_id, _peer_id, conv_id = await _setup_pair(engine)
    payload = {"content": {"kind": "text", "text": "once"}}
    headers = {"X-Dev-User-Id": me_id, "Idempotency-Key": "abc-123"}
    r1 = await client.post(f"/v1/conversations/{conv_id}/messages", headers=headers, json=payload)
    r2 = await client.post(f"/v1/conversations/{conv_id}/messages", headers=headers, json=payload)
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]
    assert r2.headers.get("idempotent-replay") == "true"


async def test_send_to_unauthorized_conversation(client: AsyncClient, engine: AsyncEngine) -> None:
    _me, _peer, conv_id = await _setup_pair(engine)
    intruder_id = new_ulid()
    now = datetime.now(timezone.utc)
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        s.add(User(id=intruder_id, name="Intruder", created_at=now, updated_at=now))
        await s.commit()

    r = await client.post(
        f"/v1/conversations/{conv_id}/messages",
        headers={"X-Dev-User-Id": intruder_id},
        json={"content": {"kind": "text", "text": "hi"}},
    )
    assert r.status_code == 404
    assert r.json()["code"] == "conversation.not_found"


async def test_send_invalid_content_kind(client: AsyncClient, engine: AsyncEngine) -> None:
    me_id, _peer, conv_id = await _setup_pair(engine)
    r = await client.post(
        f"/v1/conversations/{conv_id}/messages",
        headers={"X-Dev-User-Id": me_id},
        json={"content": {"kind": "unknown", "x": 1}},
    )
    assert r.status_code == 422
