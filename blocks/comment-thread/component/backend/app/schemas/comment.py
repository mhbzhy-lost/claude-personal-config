from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CommentAuthor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = Field(max_length=200)
    avatar_url: str | None = None


class Comment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    resource_type: str = Field(max_length=50)
    resource_id: str
    parent_comment_id: str | None = None
    author: CommentAuthor
    content: str = Field(max_length=10000)
    depth: int = Field(ge=0, le=3)
    reply_count: int = Field(ge=0)
    is_deleted: bool
    created_at: datetime
    updated_at: datetime


class CommentList(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[Comment]
    total: int = Field(ge=0)


class CreateCommentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resource_type: str = Field(min_length=1, max_length=50)
    resource_id: str = Field(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")
    parent_comment_id: str | None = Field(
        default=None, pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$"
    )
    content: str = Field(min_length=1, max_length=10000)
