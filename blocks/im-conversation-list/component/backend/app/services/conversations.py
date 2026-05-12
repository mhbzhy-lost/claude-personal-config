from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import not_found, unprocessable
from app.models import (
    Conversation as ConversationModel,
)
from app.models import (
    ConversationParticipant,
    Message as MessageModel,
    User as UserModel,
    UserConversationState,
)
from app.schemas.conversation import Conversation, ConversationPage
from app.schemas.message import Message as MessageSchema
from app.schemas.pagination import Cursor, CursorDecodeError
from app.schemas.user import User as UserSchema

PARTICIPANT_PROJECTION_LIMIT = 5


class ConversationService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_user(
        self,
        user_id: str,
        *,
        cursor_raw: str | None,
        limit: int,
        filter_: str = "all",
    ) -> ConversationPage:
        try:
            cursor = Cursor.decode(cursor_raw)
        except CursorDecodeError as exc:
            raise unprocessable("invalid_cursor", str(exc)) from exc

        ucs = UserConversationState
        conv = ConversationModel

        base = (
            select(conv, ucs)
            .join(ucs, and_(ucs.conversation_id == conv.id, ucs.user_id == user_id))
            .where(ucs.deleted_at.is_(None))
        )

        if filter_ == "unread":
            base = base.where(ucs.unread_count > 0)
        elif filter_ == "pinned":
            base = base.where(ucs.is_pinned.is_(True))
        elif filter_ == "muted":
            base = base.where(ucs.is_muted.is_(True))

        if cursor is None:
            stmt = base.order_by(
                ucs.is_pinned.desc(),
                ucs.pinned_at.desc().nulls_last(),
                conv.last_activity_at.desc(),
                conv.id.desc(),
            ).limit(limit + 1)
        else:
            stmt = (
                base.where(ucs.is_pinned.is_(False))
                .where(
                    tuple_(conv.last_activity_at, conv.id)
                    < (cursor.last_activity_at, cursor.id)
                )
                .order_by(conv.last_activity_at.desc(), conv.id.desc())
                .limit(limit + 1)
            )

        rows = (await self._session.execute(stmt)).all()
        has_more = len(rows) > limit
        rows = rows[:limit]

        if not rows:
            return ConversationPage(items=[], next_cursor=None, has_more=False)

        conv_ids = [r[0].id for r in rows]
        participants_map = await self._load_participants(conv_ids)
        last_msgs_map = await self._load_last_messages(conv_ids)

        items: list[Conversation] = []
        for conv_obj, ucs_obj in rows:
            items.append(
                self._compose_conversation(conv_obj, ucs_obj, participants_map, last_msgs_map)
            )

        next_cursor = None
        if has_more:
            tail = items[-1]
            next_cursor = Cursor(
                last_activity_at=tail.last_activity_at, id=tail.id
            ).encode()

        return ConversationPage(items=items, next_cursor=next_cursor, has_more=has_more)

    async def get(self, user_id: str, conversation_id: str) -> Conversation:
        ucs = UserConversationState
        conv = ConversationModel

        stmt = (
            select(conv, ucs)
            .join(ucs, and_(ucs.conversation_id == conv.id, ucs.user_id == user_id))
            .where(conv.id == conversation_id, ucs.deleted_at.is_(None))
        )
        row = (await self._session.execute(stmt)).first()
        if row is None:
            raise not_found("conversation.not_found")
        conv_obj, ucs_obj = row
        participants = await self._load_participants([conv_obj.id])
        last_msgs = await self._load_last_messages([conv_obj.id])
        return self._compose_conversation(conv_obj, ucs_obj, participants, last_msgs)

    async def patch_flags(
        self,
        user_id: str,
        conversation_id: str,
        *,
        is_pinned: bool | None,
        is_muted: bool | None,
        pinned_cap: int,
    ) -> tuple[Conversation, list[str]]:
        ucs = await self._get_state(user_id, conversation_id)
        changed: list[str] = []

        if is_muted is not None and ucs.is_muted != is_muted:
            ucs.is_muted = is_muted
            changed.append("is_muted")

        if is_pinned is not None and ucs.is_pinned != is_pinned:
            if is_pinned:
                count_stmt = (
                    select(func.count())
                    .select_from(UserConversationState)
                    .where(
                        UserConversationState.user_id == user_id,
                        UserConversationState.is_pinned.is_(True),
                        UserConversationState.deleted_at.is_(None),
                    )
                )
                pinned_count = (await self._session.execute(count_stmt)).scalar_one()
                if pinned_count >= pinned_cap:
                    raise unprocessable(
                        "pin.cap_exceeded",
                        f"Pinned conversations cap reached ({pinned_cap}).",
                    )
                ucs.pinned_at = datetime.now(timezone.utc)
            else:
                ucs.pinned_at = None
            ucs.is_pinned = is_pinned
            changed.append("is_pinned")

        await self._session.flush()
        return await self.get(user_id, conversation_id), changed

    async def soft_delete(self, user_id: str, conversation_id: str) -> None:
        ucs = await self._get_state(user_id, conversation_id)
        ucs.deleted_at = datetime.now(timezone.utc)
        await self._session.flush()

    async def mark_read(
        self, user_id: str, conversation_id: str, up_to_message_id: str
    ) -> None:
        ucs = await self._get_state(user_id, conversation_id)
        msg_stmt = select(MessageModel).where(
            MessageModel.id == up_to_message_id,
            MessageModel.conversation_id == conversation_id,
        )
        msg = (await self._session.execute(msg_stmt)).scalar_one_or_none()
        if msg is None:
            raise unprocessable(
                "message.not_in_conversation",
                "up_to_message_id does not belong to this conversation.",
            )
        ucs.last_read_message_id = up_to_message_id

        unread_stmt = (
            select(func.count())
            .select_from(MessageModel)
            .where(
                MessageModel.conversation_id == conversation_id,
                MessageModel.sent_at > msg.sent_at,
                MessageModel.deleted_at.is_(None),
            )
        )
        ucs.unread_count = (await self._session.execute(unread_stmt)).scalar_one()
        await self._session.flush()

    async def participants(self, conversation_id: str) -> list[str]:
        stmt = select(ConversationParticipant.user_id).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.left_at.is_(None),
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def _get_state(self, user_id: str, conversation_id: str) -> UserConversationState:
        stmt = select(UserConversationState).where(
            UserConversationState.user_id == user_id,
            UserConversationState.conversation_id == conversation_id,
            UserConversationState.deleted_at.is_(None),
        )
        ucs = (await self._session.execute(stmt)).scalar_one_or_none()
        if ucs is None:
            raise not_found("conversation.not_found")
        return ucs

    async def _load_participants(
        self, conversation_ids: list[str]
    ) -> dict[str, tuple[list[UserSchema], int]]:
        if not conversation_ids:
            return {}
        cp = ConversationParticipant
        u = UserModel
        stmt = (
            select(cp.conversation_id, u.id, u.name, u.avatar_url, u.online_status)
            .join(u, u.id == cp.user_id)
            .where(cp.conversation_id.in_(conversation_ids), cp.left_at.is_(None))
            .order_by(cp.conversation_id, cp.joined_at)
        )
        rows = (await self._session.execute(stmt)).all()

        grouped: dict[str, list[UserSchema]] = {}
        counts: dict[str, int] = {}
        for conv_id, uid, name, avatar, status in rows:
            counts[conv_id] = counts.get(conv_id, 0) + 1
            bucket = grouped.setdefault(conv_id, [])
            if len(bucket) < PARTICIPANT_PROJECTION_LIMIT:
                bucket.append(
                    UserSchema(id=uid, name=name, avatar_url=avatar, online_status=status)
                )
        return {cid: (grouped.get(cid, []), counts.get(cid, 0)) for cid in conversation_ids}

    async def _load_last_messages(
        self, conversation_ids: list[str]
    ) -> dict[str, MessageSchema]:
        if not conversation_ids:
            return {}
        m = MessageModel
        u = UserModel
        sub = (
            select(
                m.id,
                m.conversation_id,
                m.sender_id,
                m.content,
                m.client_id,
                m.status,
                m.sent_at,
                m.edited_at,
                m.deleted_at,
                func.row_number()
                .over(partition_by=m.conversation_id, order_by=m.sent_at.desc())
                .label("rn"),
            )
            .where(m.conversation_id.in_(conversation_ids))
            .subquery()
        )
        stmt = (
            select(sub, u.name, u.avatar_url, u.online_status)
            .join(u, u.id == sub.c.sender_id)
            .where(sub.c.rn == 1)
        )
        result: dict[str, MessageSchema] = {}
        for row in (await self._session.execute(stmt)).all():
            (
                msg_id,
                conv_id,
                sender_id,
                content,
                client_id,
                status,
                sent_at,
                edited_at,
                deleted_at,
                _rn,
                sender_name,
                sender_avatar,
                sender_status,
            ) = row
            result[conv_id] = MessageSchema(
                id=msg_id,
                conversation_id=conv_id,
                sender=UserSchema(
                    id=sender_id,
                    name=sender_name,
                    avatar_url=sender_avatar,
                    online_status=sender_status,
                ),
                content=content,
                client_id=client_id,
                status=status,
                sent_at=sent_at,
                edited_at=edited_at,
                deleted_at=deleted_at,
            )
        return result

    @staticmethod
    def _compose_conversation(
        conv_obj: ConversationModel,
        ucs_obj: UserConversationState,
        participants_map: dict[str, tuple[list[UserSchema], int]],
        last_msgs_map: dict[str, MessageSchema],
    ) -> Conversation:
        participants, count = participants_map.get(conv_obj.id, ([], 0))
        return Conversation(
            id=conv_obj.id,
            type=conv_obj.type,
            title=conv_obj.title,
            avatar_url=conv_obj.avatar_url,
            participants=participants,
            participant_count=count or 1,
            last_message=last_msgs_map.get(conv_obj.id),
            unread_count=ucs_obj.unread_count,
            is_pinned=ucs_obj.is_pinned,
            is_muted=ucs_obj.is_muted,
            pinned_at=ucs_obj.pinned_at,
            last_activity_at=conv_obj.last_activity_at,
            created_at=conv_obj.created_at,
            updated_at=conv_obj.updated_at,
        )
