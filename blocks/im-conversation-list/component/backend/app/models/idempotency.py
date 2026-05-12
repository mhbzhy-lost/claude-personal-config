from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampType, utcnow


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_record"
    __table_args__ = (Index("ix_idempotency_record_expires_at", "expires_at"),)

    user_id: Mapped[str] = mapped_column(String(26), primary_key=True)
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    response_status: Mapped[int] = mapped_column(Integer, nullable=False)
    response_body: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TimestampType, default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(TimestampType, nullable=False)
