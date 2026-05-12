"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

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
        "comment",
        sa.Column("id", sa.String(length=26), primary_key=True),
        sa.Column("resource_type", sa.String(length=50), nullable=False),
        sa.Column("resource_id", sa.String(length=26), nullable=False),
        sa.Column("parent_comment_id", sa.String(length=26),
                  sa.ForeignKey("comment.id", ondelete="SET NULL")),
        sa.Column("author_id", sa.String(length=26),
                  sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("content", sa.String(length=10000), nullable=False),
        sa.Column("depth", sa.Integer, nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("depth >= 0 AND depth <= 3", name="ck_comment_depth_range"),
    )
    op.create_index(
        "ix_comment_resource",
        "comment",
        ["resource_type", "resource_id", "created_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_comment_parent",
        "comment",
        ["parent_comment_id"],
        postgresql_where=sa.text("parent_comment_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_table("comment")
    op.drop_table("user")
