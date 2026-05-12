"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-12

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

_ORDER_STATUSES = "'pending','paid','shipped','delivered','cancelled','refunded'"


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column("id", sa.String(length=26), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("avatar_url", sa.String(length=2048)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "order",
        sa.Column("id", sa.String(length=26), primary_key=True),
        sa.Column("user_id", sa.String(length=26),
                  sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("order_number", sa.String(length=50), unique=True, nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="CNY"),
        sa.Column("subtotal", sa.Integer, nullable=False, server_default="0"),
        sa.Column("shipping", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total", sa.Integer, nullable=False, server_default="0"),
        sa.Column("shipping_address", postgresql.JSONB, nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("shipped_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("cancel_reason", sa.String(length=500)),
        sa.Column("refund_reason", sa.String(length=500)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"status IN ({_ORDER_STATUSES})", name="ck_order_status_enum"),
        sa.CheckConstraint("subtotal >= 0", name="ck_order_subtotal_non_negative"),
        sa.CheckConstraint("shipping >= 0", name="ck_order_shipping_non_negative"),
        sa.CheckConstraint("total >= 0", name="ck_order_total_non_negative"),
    )
    op.create_index("ix_order_user_id_created_at", "order", ["user_id", "created_at"])
    op.create_index("ix_order_user_id_status", "order", ["user_id", "status"])

    op.create_table(
        "order_item",
        sa.Column("order_id", sa.String(length=26),
                  sa.ForeignKey("order.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("line_no", sa.Integer, primary_key=True),
        sa.Column("product_id", sa.String(length=26), nullable=False),
        sa.Column("product_name", sa.String(length=200), nullable=False),
        sa.Column("product_image", sa.String(length=2048)),
        sa.Column("sku", sa.String(length=100)),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("unit_price", sa.Integer, nullable=False),
        sa.Column("line_total", sa.Integer, nullable=False),
    )

    op.create_table(
        "order_status_event",
        sa.Column("id", sa.String(length=26), primary_key=True),
        sa.Column("order_id", sa.String(length=26),
                  sa.ForeignKey("order.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.String(length=500)),
        sa.CheckConstraint(f"status IN ({_ORDER_STATUSES})", name="ck_order_status_event_status_enum"),
    )
    op.create_index("ix_order_status_event_order_id", "order_status_event",
                    ["order_id", "occurred_at"])


def downgrade() -> None:
    op.drop_table("order_status_event")
    op.drop_table("order_item")
    op.drop_table("order")
    op.drop_table("user")
