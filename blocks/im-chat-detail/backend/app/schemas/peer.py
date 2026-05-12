from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Peer(BaseModel):
    """A user from the current user's perspective. Public profile."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: str = Field(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")
    name: str = Field(max_length=200)
    avatar_url: str | None = None
    bio: str | None = Field(default=None, max_length=500)
    online_status: Literal["online", "offline", "away"] | None = None
    last_seen_at: datetime | None = None
