"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-09

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
        sa.Column("online_status", sa.String(length=16)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "online_status IN ('online','offline','away') OR online_status IS NULL",
            name="ck_user_online_status_enum",
        ),
    )

    op.create_table(
        "conversation",
        sa.Column("id", sa.String(length=26), primary_key=True),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=200)),
        sa.Column("avatar_url", sa.String(length=2048)),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("type IN ('direct','group')", name="ck_conversation_type_enum"),
    )
    op.create_index(
        "ix_conversation_last_activity_at",
        "conversation",
        ["last_activity_at"],
    )

    op.create_table(
        "conversation_participant",
        sa.Column(
            "conversation_id",
            sa.String(length=26),
            sa.ForeignKey("conversation.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.String(length=26),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("role", sa.String(length=16), nullable=False, server_default="member"),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("left_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_conversation_participant_user_id_active",
        "conversation_participant",
        ["user_id", "left_at"],
    )

    op.create_table(
        "message",
        sa.Column("id", sa.String(length=26), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.String(length=26),
            sa.ForeignKey("conversation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sender_id",
            sa.String(length=26),
            sa.ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
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
        "ix_message_conversation_sent",
        "message",
        ["conversation_id", "sent_at", "id"],
    )

    op.create_table(
        "user_conversation_state",
        sa.Column(
            "user_id",
            sa.String(length=26),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "conversation_id",
            sa.String(length=26),
            sa.ForeignKey("conversation.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("is_pinned", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_muted", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("pinned_at", sa.DateTime(timezone=True)),
        sa.Column("unread_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_read_message_id", sa.String(length=26)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_user_conversation_state_list",
        "user_conversation_state",
        ["user_id", "is_pinned", "pinned_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_user_conversation_state_unread",
        "user_conversation_state",
        ["user_id", "unread_count"],
        postgresql_where=sa.text("deleted_at IS NULL AND unread_count > 0"),
    )

    op.create_table(
        "idempotency_record",
        sa.Column("user_id", sa.String(length=26), primary_key=True),
        sa.Column("key", sa.String(length=128), primary_key=True),
        sa.Column("response_status", sa.Integer, nullable=False),
        sa.Column("response_body", postgresql.JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_idempotency_record_expires_at",
        "idempotency_record",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_table("idempotency_record")
    op.drop_table("user_conversation_state")
    op.drop_table("message")
    op.drop_table("conversation_participant")
    op.drop_table("conversation")
    op.drop_table("user")
