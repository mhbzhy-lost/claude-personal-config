from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampType


class UserConversationState(Base):
    __tablename__ = "user_conversation_state"
    __table_args__ = (
        Index(
            "ix_user_conversation_state_list",
            "user_id",
            "is_pinned",
            "pinned_at",
            postgresql_where="deleted_at IS NULL",
        ),
        Index(
            "ix_user_conversation_state_unread",
            "user_id",
            "unread_count",
            postgresql_where="deleted_at IS NULL AND unread_count > 0",
        ),
    )

    user_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("user.id", ondelete="CASCADE"),
        primary_key=True,
    )
    conversation_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("conversation.id", ondelete="CASCADE"),
        primary_key=True,
    )

    is_pinned: Mapped[bool] = mapped_column(default=False, nullable=False)
    is_muted: Mapped[bool] = mapped_column(default=False, nullable=False)
    pinned_at: Mapped[datetime | None] = mapped_column(TimestampType)
    unread_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_read_message_id: Mapped[str | None] = mapped_column(String(26))
    deleted_at: Mapped[datetime | None] = mapped_column(TimestampType)
