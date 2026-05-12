from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from app.config import get_settings
from app.db import Database
from app.models import Message, User
from app.ulid_utils import new_ulid


async def reset(db: Database) -> None:
    async with db.session() as s:
        for m in (Message, User):
            await s.execute(delete(m))
        await s.commit()


async def seed_demo(
    db: Database,
    primary_user_id: str | None = None,
    peer_id: str | None = None,
) -> tuple[str, str]:
    """Create two users + a sample conversation. Returns (me_id, peer_id)."""
    now = datetime.now(timezone.utc)
    async with db.session() as s:
        me_id = primary_user_id or new_ulid()
        peer_id = peer_id or new_ulid()
        s.add(
            User(
                id=me_id,
                name="Alice",
                avatar_url="https://i.pravatar.cc/96?u=alice",
                bio="后端工程师，写代码养猫 🐈",
                online_status="online",
                last_seen_at=now,
                created_at=now,
                updated_at=now,
            )
        )
        s.add(
            User(
                id=peer_id,
                name="Bob",
                avatar_url="https://i.pravatar.cc/96?u=bob",
                bio="设计师，喜欢马拉松 🏃",
                online_status="away",
                last_seen_at=now - timedelta(minutes=20),
                created_at=now,
                updated_at=now,
            )
        )
        await s.flush()

        # Sample messages — alternating, last 10 minutes
        msgs = [
            (peer_id, me_id, "周末有空一起跑步吗？", -10),
            (me_id, peer_id, "好啊，几点？", -9),
            (peer_id, me_id, "早上 8 点滨江公园？", -8),
            (me_id, peer_id, "OK 我准时", -7),
            (peer_id, me_id, "记得带水", -6),
            (me_id, peer_id, "👍", -5),
        ]
        for sender, recipient, text, m_offset in msgs:
            s.add(
                Message(
                    id=new_ulid(),
                    sender_id=sender,
                    recipient_id=recipient,
                    content={"kind": "text", "text": text},
                    status="read" if m_offset < -5 else "delivered",
                    sent_at=now + timedelta(minutes=m_offset),
                )
            )
        await s.commit()
    return me_id, peer_id


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="chat-seed")
    parser.add_argument("mode", choices=["demo", "reset"])
    parser.add_argument("--primary-user-id", default=None)
    parser.add_argument("--peer-id", default=None)
    args = parser.parse_args(argv)

    settings = get_settings()
    db = Database(settings.database_url)

    async def run() -> tuple[str, str] | None:
        if args.mode == "reset":
            await reset(db)
            await db.dispose()
            return None
        ids = await seed_demo(db, primary_user_id=args.primary_user_id, peer_id=args.peer_id)
        await db.dispose()
        return ids

    result = asyncio.run(run())
    if result:
        me_id, peer_id = result
        print(f"Seeded {args.mode}. me_id (Alice) = {me_id}")
        print(f"                  peer_id (Bob)  = {peer_id}")
        print(f"Use header: X-Dev-User-Id: {me_id}")
    else:
        print("Reset complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
