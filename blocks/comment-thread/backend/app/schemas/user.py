from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class User(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: str = Field(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")
    name: str = Field(max_length=200)
    avatar_url: str | None = None
