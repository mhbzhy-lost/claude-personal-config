from __future__ import annotations

from typing import Annotated, Any, Literal

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


class ContentSystem(_ContentBase):
    kind: Literal["system"]
    code: str = Field(max_length=100)
    params: dict[str, Any] = Field(default_factory=dict)


class ContentRecall(_ContentBase):
    kind: Literal["recall"]
    recall_of: str = Field(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")


Content = Annotated[
    ContentText | ContentImage | ContentFile | ContentSystem | ContentRecall,
    Field(discriminator="kind"),
]
