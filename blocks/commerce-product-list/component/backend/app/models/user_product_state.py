from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampType, utcnow


class UserProductState(Base):
    __tablename__ = "user_product_state"
    __table_args__ = (
        CheckConstraint("cart_count >= 0", name="cart_count_non_negative"),
        Index("ix_user_product_state_favorites", "user_id", "favorited_at",
              postgresql_where="is_favorite = true"),
        Index("ix_user_product_state_cart", "user_id", "updated_at",
              postgresql_where="cart_count > 0"),
    )

    user_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("user.id", ondelete="CASCADE"),
        primary_key=True,
    )
    product_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("product.id", ondelete="CASCADE"),
        primary_key=True,
    )

    is_favorite: Mapped[bool] = mapped_column(default=False, nullable=False)
    cart_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    favorited_at: Mapped[datetime | None] = mapped_column(TimestampType)
    updated_at: Mapped[datetime] = mapped_column(
        TimestampType, default=utcnow, onupdate=utcnow, nullable=False
    )
