from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampType, TimestampedMixin, utcnow


class Conversation(Base, TimestampedMixin):
    __tablename__ = "conversation"
    __table_args__ = (
        CheckConstraint("type IN ('direct','group')", name="type_enum"),
        Index("ix_conversation_last_activity_at", "last_activity_at"),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    title: Mapped[str | None] = mapped_column(String(200))
    avatar_url: Mapped[str | None] = mapped_column(String(2048))
    last_activity_at: Mapped[datetime] = mapped_column(
        TimestampType, default=utcnow, nullable=False
    )


class ConversationParticipant(Base):
    __tablename__ = "conversation_participant"
    __table_args__ = (
        Index("ix_conversation_participant_user_id_active", "user_id", "left_at"),
    )

    conversation_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("conversation.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("user.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(String(16), default="member", nullable=False)
    joined_at: Mapped[datetime] = mapped_column(TimestampType, default=utcnow, nullable=False)
    left_at: Mapped[datetime | None] = mapped_column(TimestampType)
