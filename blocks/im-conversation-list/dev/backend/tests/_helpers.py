"""Shared fixtures helpers for tests."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import (
    Conversation,
    ConversationParticipant,
    Message,
    User,
    UserConversationState,
)
from app.ulid_utils import new_ulid


async def make_user(s: AsyncSession, name: str) -> str:
    now = datetime.now(timezone.utc)
    uid = new_ulid()
    s.add(User(id=uid, name=name, created_at=now, updated_at=now))
    await s.flush()
    return uid


async def make_direct_conversation(
    s: AsyncSession,
    user_a: str,
    user_b: str,
    *,
    last_activity_offset_minutes: int = 0,
    title: str | None = None,
    pinned_for: str | None = None,
    unread_for: dict[str, int] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    cid = new_ulid()
    s.add(
        Conversation(
            id=cid,
            type="direct",
            title=title,
            last_activity_at=now - timedelta(minutes=last_activity_offset_minutes),
            created_at=now,
            updated_at=now,
        )
    )
    await s.flush()
    for uid in (user_a, user_b):
        s.add(
            ConversationParticipant(
                conversation_id=cid, user_id=uid, role="member", joined_at=now
            )
        )
        s.add(
            UserConversationState(
                user_id=uid,
                conversation_id=cid,
                is_pinned=(uid == pinned_for),
                pinned_at=now if uid == pinned_for else None,
                unread_count=(unread_for or {}).get(uid, 0),
            )
        )
    await s.flush()
    return cid


async def add_message(
    s: AsyncSession,
    *,
    conversation_id: str,
    sender_id: str,
    text: str,
    sent_at: datetime | None = None,
) -> str:
    sent_at = sent_at or datetime.now(timezone.utc)
    mid = new_ulid()
    s.add(
        Message(
            id=mid,
            conversation_id=conversation_id,
            sender_id=sender_id,
            content={"kind": "text", "text": text},
            client_id=None,
            status="sent",
            sent_at=sent_at,
        )
    )
    await s.flush()
    return mid


async def setup_pair(engine: AsyncEngine) -> tuple[str, str, str]:
    """Create 2 users + 1 direct conversation. Returns (me, peer, conversation_id)."""
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        me = await make_user(s, "Me")
        peer = await make_user(s, "Peer")
        cid = await make_direct_conversation(s, me, peer)
        await s.commit()
    return me, peer, cid
