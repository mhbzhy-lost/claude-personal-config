from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.ulid_utils import new_ulid


async def make_user(s: AsyncSession, name: str = "Test User") -> str:
    now = datetime.now(timezone.utc)
    uid = new_ulid()
    s.add(User(id=uid, name=name, created_at=now, updated_at=now))
    await s.flush()
    return uid
