from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import conflict, not_found, unprocessable
from app.models import (
    ConversationParticipant,
    IdempotencyRecord,
    Message as MessageModel,
    User as UserModel,
    UserConversationState,
)
from app.models.conversation import Conversation as ConversationModel
from app.schemas.content import Content
from app.schemas.message import Message, MessagePage
from app.schemas.user import User as UserSchema
from app.ulid_utils import new_ulid


class MessageService:
    def __init__(self, session: AsyncSession, idempotency_ttl_hours: int = 24) -> None:
        self._session = session
        self._idemp_ttl = timedelta(hours=idempotency_ttl_hours)

    async def list_for_conversation(
        self,
        user_id: str,
        conversation_id: str,
        *,
        cursor: str | None,
        limit: int,
    ) -> MessagePage:
        await self._ensure_member(user_id, conversation_id)

        m = MessageModel
        stmt = (
            select(m, UserModel.name, UserModel.avatar_url, UserModel.online_status)
            .join(UserModel, UserModel.id == m.sender_id)
            .where(m.conversation_id == conversation_id)
            .order_by(m.sent_at.desc(), m.id.desc())
            .limit(limit + 1)
        )
        if cursor:
            try:
                ts_str, msg_id = cursor.split("|", 1)
                cursor_ts = datetime.fromisoformat(ts_str)
            except ValueError as exc:
                raise unprocessable("invalid_cursor", str(exc)) from exc
            stmt = stmt.where((m.sent_at, m.id) < (cursor_ts, msg_id))

        rows = (await self._session.execute(stmt)).all()
        has_more = len(rows) > limit
        rows = rows[:limit]

        items: list[Message] = []
        for msg, sender_name, sender_avatar, sender_status in rows:
            items.append(
                Message(
                    id=msg.id,
                    conversation_id=msg.conversation_id,
                    sender=UserSchema(
                        id=msg.sender_id,
                        name=sender_name,
                        avatar_url=sender_avatar,
                        online_status=sender_status,
                    ),
                    content=msg.content,
                    client_id=msg.client_id,
                    status=msg.status,
                    sent_at=msg.sent_at,
                    edited_at=msg.edited_at,
                    deleted_at=msg.deleted_at,
                )
            )

        next_cursor = None
        if has_more and items:
            tail = items[-1]
            next_cursor = f"{tail.sent_at.isoformat()}|{tail.id}"

        return MessagePage(items=items, next_cursor=next_cursor, has_more=has_more)

    async def send(
        self,
        user_id: str,
        conversation_id: str,
        *,
        content: Content,
        client_id: str | None,
        idempotency_key: str | None,
    ) -> tuple[Message, bool]:
        """Returns (message, is_replay). is_replay=True when idempotent."""
        if idempotency_key:
            replay = await self._idempotency_lookup(user_id, idempotency_key)
            if replay is not None:
                return Message.model_validate(replay), True

        await self._ensure_member(user_id, conversation_id)

        msg_id = new_ulid()
        now = datetime.now(timezone.utc)
        msg = MessageModel(
            id=msg_id,
            conversation_id=conversation_id,
            sender_id=user_id,
            content=content.model_dump(),
            client_id=client_id,
            status="sent",
            sent_at=now,
        )
        self._session.add(msg)

        await self._session.execute(
            update(ConversationModel)
            .where(ConversationModel.id == conversation_id)
            .values(last_activity_at=now, updated_at=now)
        )

        members_stmt = select(ConversationParticipant.user_id).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.left_at.is_(None),
        )
        member_ids = list((await self._session.execute(members_stmt)).scalars().all())

        for mid in member_ids:
            if mid == user_id:
                continue
            await self._session.execute(
                update(UserConversationState)
                .where(
                    UserConversationState.user_id == mid,
                    UserConversationState.conversation_id == conversation_id,
                )
                .values(unread_count=UserConversationState.unread_count + 1)
            )

        await self._session.flush()

        sender_stmt = select(UserModel).where(UserModel.id == user_id)
        sender = (await self._session.execute(sender_stmt)).scalar_one()

        result = Message(
            id=msg_id,
            conversation_id=conversation_id,
            sender=UserSchema(
                id=sender.id,
                name=sender.name,
                avatar_url=sender.avatar_url,
                online_status=sender.online_status,
            ),
            content=content,
            client_id=client_id,
            status="sent",
            sent_at=now,
        )

        if idempotency_key:
            await self._idempotency_store(user_id, idempotency_key, 201, result.model_dump(mode="json"))

        return result, False

    async def _ensure_member(self, user_id: str, conversation_id: str) -> None:
        stmt = select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
            ConversationParticipant.left_at.is_(None),
        )
        cp = (await self._session.execute(stmt)).scalar_one_or_none()
        if cp is None:
            raise not_found("conversation.not_found")

    async def _idempotency_lookup(self, user_id: str, key: str) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc)
        stmt = select(IdempotencyRecord).where(
            IdempotencyRecord.user_id == user_id,
            IdempotencyRecord.key == key,
            IdempotencyRecord.expires_at > now,
        )
        rec = (await self._session.execute(stmt)).scalar_one_or_none()
        return rec.response_body if rec else None

    async def _idempotency_store(
        self, user_id: str, key: str, status: int, body: dict[str, Any]
    ) -> None:
        now = datetime.now(timezone.utc)
        rec = IdempotencyRecord(
            user_id=user_id,
            key=key,
            response_status=status,
            response_body=body,
            created_at=now,
            expires_at=now + self._idemp_ttl,
        )
        self._session.add(rec)
        try:
            await self._session.flush()
        except IntegrityError as exc:
            await self._session.rollback()
            raise conflict("idempotency.conflict", "Idempotency-Key collision") from exc
