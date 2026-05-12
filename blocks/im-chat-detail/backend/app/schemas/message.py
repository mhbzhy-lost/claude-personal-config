from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class _ContentBase(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ContentText(_ContentBase):
    kind: Literal["text"]
    text: str = Field(max_length=10000)


class ContentImage(_ContentBase):
    kind: Literal["image"]
    url: str
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
    alt: str | None = Field(default=None, max_length=500)


class ContentFile(_ContentBase):
    kind: Literal["file"]
    url: str
    name: str = Field(max_length=500)
    size: int = Field(ge=0)
    mime: str = Field(max_length=200)


class ContentRecall(_ContentBase):
    kind: Literal["recall"]


Content = Annotated[
    ContentText | ContentImage | ContentFile | ContentRecall,
    Field(discriminator="kind"),
]


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    sender_id: str
    recipient_id: str
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

    recipient_id: str = Field(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")
    content: Content
    client_id: str | None = Field(default=None, max_length=128)


class MarkReadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    up_to_message_id: str = Field(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")
