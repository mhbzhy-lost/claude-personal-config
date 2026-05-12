from __future__ import annotations

from sqlalchemy import CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedMixin


class User(Base, TimestampedMixin):
    __tablename__ = "user"
    __table_args__ = (
        CheckConstraint(
            "online_status IN ('online','offline','away') OR online_status IS NULL",
            name="online_status_enum",
        ),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(2048))
    online_status: Mapped[str | None] = mapped_column(String(16))
