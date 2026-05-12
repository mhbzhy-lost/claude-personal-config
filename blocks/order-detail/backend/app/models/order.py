from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampType, TimestampedMixin, utcnow

_ORDER_STATUSES = "'pending','paid','shipped','delivered','cancelled','refunded'"


class Order(Base, TimestampedMixin):
    __tablename__ = "order"
    __table_args__ = (
        CheckConstraint(f"status IN ({_ORDER_STATUSES})", name="status_enum"),
        CheckConstraint("subtotal >= 0", name="subtotal_non_negative"),
        CheckConstraint("shipping >= 0", name="shipping_non_negative"),
        CheckConstraint("total >= 0", name="total_non_negative"),
        Index("ix_order_user_id_created_at", "user_id", "created_at"),
        Index("ix_order_user_id_status", "user_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("user.id", ondelete="RESTRICT"), nullable=False
    )
    order_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CNY")
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shipping: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shipping_address: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(TimestampType)
    shipped_at: Mapped[datetime | None] = mapped_column(TimestampType)
    delivered_at: Mapped[datetime | None] = mapped_column(TimestampType)
    cancelled_at: Mapped[datetime | None] = mapped_column(TimestampType)
    cancel_reason: Mapped[str | None] = mapped_column(String(500))
    refund_reason: Mapped[str | None] = mapped_column(String(500))


class OrderItem(Base):
    __tablename__ = "order_item"

    order_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("order.id", ondelete="CASCADE"),
        primary_key=True,
    )
    line_no: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[str] = mapped_column(String(26), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    product_image: Mapped[str | None] = mapped_column(String(2048))
    sku: Mapped[str | None] = mapped_column(String(100))
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[int] = mapped_column(Integer, nullable=False)


class OrderStatusEvent(Base):
    __tablename__ = "order_status_event"
    __table_args__ = (
        CheckConstraint(f"status IN ({_ORDER_STATUSES})", name="status_enum"),
        Index("ix_order_status_event_order_id", "order_id", "occurred_at"),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    order_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("order.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        TimestampType, default=utcnow, nullable=False
    )
    note: Mapped[str | None] = mapped_column(String(500))
