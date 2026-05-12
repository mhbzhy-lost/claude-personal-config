from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampType, TimestampedMixin


class Comment(Base, TimestampedMixin):
    __tablename__ = "comment"
    __table_args__ = (
        CheckConstraint("depth >= 0 AND depth <= 3", name="depth_range"),
        # resource_type / resource_id are a soft pointer to an arbitrary host
        # entity (article / product / order / ...). Not FK — the host table
        # is owned by the consuming application, not by this block.
        Index(
            "ix_comment_resource",
            "resource_type",
            "resource_id",
            "created_at",
            postgresql_where="deleted_at IS NULL",
        ),
        Index(
            "ix_comment_parent",
            "parent_comment_id",
            postgresql_where="parent_comment_id IS NOT NULL",
        ),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(26), nullable=False)
    parent_comment_id: Mapped[str | None] = mapped_column(
        String(26),
        ForeignKey("comment.id", ondelete="SET NULL"),
    )
    author_id: Mapped[str] = mapped_column(
        String(26),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(String(10000), nullable=False)
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(TimestampType)
