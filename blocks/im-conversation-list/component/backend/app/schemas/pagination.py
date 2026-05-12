from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict


class Cursor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    last_activity_at: datetime
    id: str

    @classmethod
    def decode(cls, raw: str | None) -> "Cursor | None":
        if not raw:
            return None
        try:
            payload = json.loads(base64.urlsafe_b64decode(raw.encode()).decode())
            payload["last_activity_at"] = datetime.fromisoformat(payload["last_activity_at"])
            return cls.model_validate(payload)
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            raise CursorDecodeError(str(exc)) from exc

    def encode(self) -> str:
        payload: dict[str, Any] = {
            "last_activity_at": self.last_activity_at.astimezone(timezone.utc).isoformat(),
            "id": self.id,
        }
        return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()


class CursorDecodeError(ValueError):
    pass
