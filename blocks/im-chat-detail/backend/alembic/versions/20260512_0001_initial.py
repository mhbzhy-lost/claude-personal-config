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
        sa.Column("bio", sa.String(length=500)),
        sa.Column("online_status", sa.String(length=16)),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "online_status IN ('online','offline','away') OR online_status IS NULL",
            name="ck_user_online_status_enum",
        ),
    )

    op.create_table(
        "message",
        sa.Column("id", sa.String(length=26), primary_key=True),
        sa.Column("sender_id", sa.String(length=26),
                  sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("recipient_id", sa.String(length=26),
                  sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("content", postgresql.JSONB, nullable=False),
        sa.Column("client_id", sa.String(length=128)),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="sent"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("edited_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('sending','sent','delivered','read','failed')",
            name="ck_message_status_enum",
        ),
    )
    op.create_index(
        "ix_message_pair_sent",
        "message",
        ["sender_id", "recipient_id", "sent_at", "id"],
    )
    op.create_index(
        "ix_message_recipient_unread",
        "message",
        ["recipient_id"],
        postgresql_where=sa.text("status IN ('sent','delivered')"),
    )


def downgrade() -> None:
    op.drop_table("message")
    op.drop_table("user")
