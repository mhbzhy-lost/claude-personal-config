from __future__ import annotations

import base64
from datetime import datetime, timezone

from sqlalchemy import and_, or_, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import not_found, unprocessable
from app.models import Message as MessageModel
from app.models import User as UserModel
from app.schemas.message import Content, Message as MessageSchema, MessagePage
from app.schemas.peer import Peer
from app.ulid_utils import new_ulid


class ChatService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_peer(self, peer_id: str) -> Peer:
        stmt = select(UserModel).where(UserModel.id == peer_id)
        user = (await self._session.execute(stmt)).scalar_one_or_none()
        if user is None:
            raise not_found("peer.not_found")
        return Peer.model_validate(user, from_attributes=True)

    async def list_messages(
        self,
        user_id: str,
        peer_id: str,
        *,
        cursor: str | None,
        limit: int,
    ) -> MessagePage:
        # Pair query: messages where (sender=me AND recipient=peer) OR vice versa.
        m = MessageModel
        pair_filter = or_(
            and_(m.sender_id == user_id, m.recipient_id == peer_id),
            and_(m.sender_id == peer_id, m.recipient_id == user_id),
        )
        stmt = (
            select(m)
            .where(pair_filter)
            .order_by(m.sent_at.desc(), m.id.desc())
            .limit(limit + 1)
        )
        if cursor:
            try:
                decoded = base64.urlsafe_b64decode(cursor.encode()).decode()
                ts_str, msg_id = decoded.split("|", 1)
                cursor_ts = datetime.fromisoformat(ts_str)
            except (ValueError, UnicodeDecodeError) as exc:
                raise unprocessable("invalid_cursor", str(exc)) from exc
            stmt = stmt.where(tuple_(m.sent_at, m.id) < (cursor_ts, msg_id))

        rows = (await self._session.execute(stmt)).scalars().all()
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [self._to_schema(r) for r in rows]
        next_cursor = None
        if has_more and items:
            tail = items[-1]
            raw = f"{tail.sent_at.isoformat()}|{tail.id}"
            next_cursor = base64.urlsafe_b64encode(raw.encode()).decode()
        return MessagePage(items=items, next_cursor=next_cursor, has_more=has_more)

    async def send_message(
        self,
        user_id: str,
        recipient_id: str,
        content: Content,
        client_id: str | None,
    ) -> MessageSchema:
        peer = await self._session.get(UserModel, recipient_id)
        if peer is None:
            raise not_found("peer.not_found")
        now = datetime.now(timezone.utc)
        msg_id = new_ulid()
        msg = MessageModel(
            id=msg_id,
            sender_id=user_id,
            recipient_id=recipient_id,
            content=content.model_dump(),
            client_id=client_id,
            status="sent",
            sent_at=now,
        )
        self._session.add(msg)
        await self._session.flush()
        return self._to_schema(msg)

    async def mark_read(
        self, user_id: str, peer_id: str, up_to_message_id: str
    ) -> int:
        """Mark all messages from peer (recipient=me, sender=peer) read up to id."""
        m = MessageModel
        target = await self._session.get(m, up_to_message_id)
        if target is None:
            raise unprocessable("message.not_found", "Target message not found.")
        if not (target.sender_id == peer_id and target.recipient_id == user_id):
            raise unprocessable(
                "message.not_in_thread",
                "Target message is not in this conversation.",
            )
        stmt = (
            update(m)
            .where(
                m.sender_id == peer_id,
                m.recipient_id == user_id,
                m.sent_at <= target.sent_at,
                m.status.in_(["sent", "delivered"]),
            )
            .values(status="read")
            .returning(m.id)
        )
        result = await self._session.execute(stmt)
        rows = result.scalars().all()
        return len(rows)

    async def recall_message(self, user_id: str, message_id: str) -> MessageSchema:
        msg = await self._session.get(MessageModel, message_id)
        if msg is None or msg.deleted_at is not None:
            raise not_found("message.not_found")
        if msg.sender_id != user_id:
            raise unprocessable("message.not_sender", "Only the sender can recall a message.")
        msg.content = {"kind": "recall"}
        msg.deleted_at = datetime.now(timezone.utc)
        await self._session.flush()
        return self._to_schema(msg)

    @staticmethod
    def _to_schema(m: MessageModel) -> MessageSchema:
        return MessageSchema(
            id=m.id,
            sender_id=m.sender_id,
            recipient_id=m.recipient_id,
            content=m.content,  # discriminated union resolves via "kind"
            client_id=m.client_id,
            status=m.status,
            sent_at=m.sent_at,
            edited_at=m.edited_at,
            deleted_at=m.deleted_at,
        )
