from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampType, utcnow


class Message(Base):
    __tablename__ = "message"
    __table_args__ = (
        CheckConstraint(
            "status IN ('sending','sent','delivered','read','failed')",
            name="status_enum",
        ),
        Index(
            "ix_message_conversation_sent",
            "conversation_id",
            "sent_at",
            "id",
            postgresql_using="btree",
        ),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("conversation.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=False,
    )
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    client_id: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(16), default="sent", nullable=False)
    sent_at: Mapped[datetime] = mapped_column(TimestampType, default=utcnow, nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(TimestampType)
    deleted_at: Mapped[datetime | None] = mapped_column(TimestampType)
