from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.message import Message
from app.schemas.user import User


class Conversation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: Literal["direct", "group"]
    title: str | None = None
    avatar_url: str | None = None
    participants: list[User] = Field(max_length=5)
    participant_count: int = Field(ge=1)
    last_message: Message | None = None
    unread_count: int = Field(ge=0)
    is_pinned: bool
    is_muted: bool
    pinned_at: datetime | None = None
    last_activity_at: datetime
    created_at: datetime
    updated_at: datetime


class ConversationPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[Conversation]
    next_cursor: str | None = None
    has_more: bool


class ConversationPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_pinned: bool | None = None
    is_muted: bool | None = None


class MarkReadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    up_to_message_id: str = Field(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")
