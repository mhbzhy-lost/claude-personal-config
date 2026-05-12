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
        "product",
        sa.Column("id", sa.String(length=26), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=2000)),
        sa.Column("price", sa.Integer, nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="CNY"),
        sa.Column("original_price", sa.Integer),
        sa.Column("cover_image", sa.String(length=2048), nullable=False),
        sa.Column("images", postgresql.ARRAY(sa.String(length=2048)), nullable=False,
                  server_default="{}"),
        sa.Column("stock", sa.Integer, nullable=False, server_default="0"),
        sa.Column("sold_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("rating", sa.Float),
        sa.Column("rating_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("category", sa.String(length=100), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.String(length=50)), nullable=False,
                  server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("price >= 0", name="ck_product_price_non_negative"),
        sa.CheckConstraint("stock >= 0", name="ck_product_stock_non_negative"),
        sa.CheckConstraint("sold_count >= 0", name="ck_product_sold_count_non_negative"),
        sa.CheckConstraint(
            "rating IS NULL OR (rating >= 0 AND rating <= 5)",
            name="ck_product_rating_range",
        ),
    )
    op.create_index("ix_product_created_at", "product", ["created_at"])
    op.create_index("ix_product_price", "product", ["price"])
    op.create_index("ix_product_sold_count", "product", ["sold_count"])
    op.create_index("ix_product_rating", "product", ["rating"])
    op.create_index("ix_product_category", "product", ["category"])

    op.create_table(
        "user_product_state",
        sa.Column("user_id", sa.String(length=26),
                  sa.ForeignKey("user.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("product_id", sa.String(length=26),
                  sa.ForeignKey("product.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("is_favorite", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("cart_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("favorited_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("cart_count >= 0", name="ck_user_product_state_cart_count_non_negative"),
    )
    op.create_index(
        "ix_user_product_state_favorites",
        "user_product_state",
        ["user_id", "favorited_at"],
        postgresql_where=sa.text("is_favorite = true"),
    )
    op.create_index(
        "ix_user_product_state_cart",
        "user_product_state",
        ["user_id", "updated_at"],
        postgresql_where=sa.text("cart_count > 0"),
    )


def downgrade() -> None:
    op.drop_table("user_product_state")
    op.drop_table("product")
    op.drop_table("user")
