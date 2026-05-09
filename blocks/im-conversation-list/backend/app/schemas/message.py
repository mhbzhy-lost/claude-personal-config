from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.content import Content
from app.schemas.user import User


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")
    conversation_id: str
    sender: User
    content: Content
    client_id: str | None = None
    status: Literal["sending", "sent", "delivered", "read", "failed"]
    sent_at: datetime
    edited_at: datetime | None = None
    deleted_at: datetime | None = None


class MessagePage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[Message]
    next_cursor: str | None = None
    has_more: bool


class SendMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: Content
    client_id: str | None = Field(default=None, max_length=128)
