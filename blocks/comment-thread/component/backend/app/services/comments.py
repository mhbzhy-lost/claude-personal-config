from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import not_found, unprocessable
from app.errors import ProblemException
from app.models import Comment as CommentModel
from app.models import User as UserModel
from app.schemas.comment import (
    Comment as CommentSchema,
    CommentAuthor,
    CommentList,
    CreateCommentRequest,
)
from app.ulid_utils import new_ulid

MAX_DEPTH = 3
DELETED_PLACEHOLDER = ""


class CommentService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_resource(
        self, resource_type: str, resource_id: str
    ) -> CommentList:
        c = CommentModel
        u = UserModel
        # Load all comments (deleted too — frontend needs them to render
        # tree structure with "[deleted]" placeholders).
        stmt = (
            select(c, u.name, u.avatar_url)
            .join(u, u.id == c.author_id)
            .where(c.resource_type == resource_type, c.resource_id == resource_id)
            .order_by(c.created_at)
        )
        rows = (await self._session.execute(stmt)).all()
        if not rows:
            return CommentList(items=[], total=0)

        # Reply count subquery — count direct children per parent.
        child_stmt = (
            select(c.parent_comment_id, func.count().label("cnt"))
            .where(
                c.resource_type == resource_type,
                c.resource_id == resource_id,
                c.parent_comment_id.is_not(None),
                c.deleted_at.is_(None),
            )
            .group_by(c.parent_comment_id)
        )
        reply_counts: dict[str, int] = dict(
            (await self._session.execute(child_stmt)).all()
        )

        items: list[CommentSchema] = []
        for row in rows:
            comment, name, avatar = row
            is_deleted = comment.deleted_at is not None
            items.append(
                CommentSchema(
                    id=comment.id,
                    resource_type=comment.resource_type,
                    resource_id=comment.resource_id,
                    parent_comment_id=comment.parent_comment_id,
                    author=CommentAuthor(id=comment.author_id, name=name, avatar_url=avatar),
                    content=DELETED_PLACEHOLDER if is_deleted else comment.content,
                    depth=comment.depth,
                    reply_count=reply_counts.get(comment.id, 0),
                    is_deleted=is_deleted,
                    created_at=comment.created_at,
                    updated_at=comment.updated_at,
                )
            )
        return CommentList(items=items, total=len(items))

    async def create(self, user_id: str, body: CreateCommentRequest) -> CommentSchema:
        depth = 0
        parent: CommentModel | None = None
        if body.parent_comment_id:
            stmt = select(CommentModel).where(
                CommentModel.id == body.parent_comment_id,
                CommentModel.resource_type == body.resource_type,
                CommentModel.resource_id == body.resource_id,
                CommentModel.deleted_at.is_(None),
            )
            parent = (await self._session.execute(stmt)).scalar_one_or_none()
            if parent is None:
                raise not_found("comment.parent_not_found")
            if parent.depth + 1 > MAX_DEPTH:
                raise unprocessable(
                    "comment.depth_exceeded",
                    f"Max nesting depth is {MAX_DEPTH}.",
                )
            depth = parent.depth + 1

        now = datetime.now(timezone.utc)
        cid = new_ulid()
        self._session.add(
            CommentModel(
                id=cid,
                resource_type=body.resource_type,
                resource_id=body.resource_id,
                parent_comment_id=body.parent_comment_id,
                author_id=user_id,
                content=body.content,
                depth=depth,
                created_at=now,
                updated_at=now,
            )
        )
        await self._session.flush()

        user = await self._session.get(UserModel, user_id)
        assert user is not None  # required auth implies user exists
        return CommentSchema(
            id=cid,
            resource_type=body.resource_type,
            resource_id=body.resource_id,
            parent_comment_id=body.parent_comment_id,
            author=CommentAuthor(id=user.id, name=user.name, avatar_url=user.avatar_url),
            content=body.content,
            depth=depth,
            reply_count=0,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )

    async def soft_delete(self, user_id: str, comment_id: str) -> None:
        comment = await self._session.get(CommentModel, comment_id)
        if comment is None or comment.deleted_at is not None:
            raise not_found("comment.not_found")
        if comment.author_id != user_id:
            raise ProblemException(403, "Forbidden", code="comment.not_author")
        comment.deleted_at = datetime.now(timezone.utc)
        await self._session.flush()
