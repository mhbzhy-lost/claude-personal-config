from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone

from sqlalchemy import delete

from app.config import get_settings
from app.db import Database
from app.models import User
from app.ulid_utils import new_ulid


async def reset(db: Database) -> None:
    """Truncate all tables. Extend as your domain grows."""
    async with db.session() as s:
        # Add domain tables to the iteration as you create them:
        for m in (User,):
            await s.execute(delete(m))
        await s.commit()


async def seed_demo(db: Database, primary_user_id: str | None = None) -> str:
    """Minimal demo seed. Extend with your domain data."""
    now = datetime.now(timezone.utc)
    async with db.session() as s:
        primary_id = primary_user_id or new_ulid()
        s.add(User(id=primary_id, name="Demo User", created_at=now, updated_at=now))
        await s.commit()
    return primary_id


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pd-seed")
    parser.add_argument("mode", choices=["demo", "reset"])
    parser.add_argument("--primary-user-id", default=None)
    args = parser.parse_args(argv)

    settings = get_settings()
    db = Database(settings.database_url)

    async def run() -> str | None:
        if args.mode == "reset":
            await reset(db)
            await db.dispose()
            return None
        uid = await seed_demo(db, primary_user_id=args.primary_user_id)
        await db.dispose()
        return uid

    uid = asyncio.run(run())
    if uid:
        print(f"Seeded {args.mode}. Primary user_id = {uid}")
        print(f"Use header: X-Dev-User-Id: {uid}")
    else:
        print("Reset complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
