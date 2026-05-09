from __future__ import annotations

import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone

from faker import Faker
from sqlalchemy import delete

from app.config import get_settings
from app.db import Database
from app.models import (
    Conversation,
    ConversationParticipant,
    IdempotencyRecord,
    Message,
    User,
    UserConversationState,
)
from app.ulid_utils import new_ulid

faker = Faker()


async def reset(db: Database) -> None:
    async with db.session() as s:
        for model in (
            IdempotencyRecord,
            UserConversationState,
            Message,
            ConversationParticipant,
            Conversation,
            User,
        ):
            await s.execute(delete(model))
        await s.commit()


async def seed(
    db: Database,
    *,
    user_count: int,
    direct_count: int,
    group_count: int,
    msgs_per_conv: tuple[int, int],
    pinned_ratio: float = 0.05,
    muted_ratio: float = 0.1,
    primary_user_id: str | None = None,
) -> str:
    """Returns the primary (demo) user_id."""
    now = datetime.now(timezone.utc)

    async with db.session() as s:
        users: list[User] = []
        primary_id = primary_user_id or new_ulid()
        primary = User(
            id=primary_id,
            name="Demo User",
            avatar_url=None,
            online_status="online",
            created_at=now,
            updated_at=now,
        )
        users.append(primary)
        for _ in range(user_count - 1):
            users.append(
                User(
                    id=new_ulid(),
                    name=faker.name(),
                    avatar_url=f"https://i.pravatar.cc/96?u={faker.uuid4()}",
                    online_status=random.choice(["online", "offline", "away", None]),
                    created_at=now,
                    updated_at=now,
                )
            )
        s.add_all(users)
        await s.flush()

        conversations: list[Conversation] = []
        participants: list[ConversationParticipant] = []
        ucs_records: list[UserConversationState] = []
        messages: list[Message] = []

        for _ in range(direct_count):
            peer = random.choice(users[1:])
            conv = Conversation(
                id=new_ulid(),
                type="direct",
                title=None,
                last_activity_at=_random_recent(now),
                created_at=now,
                updated_at=now,
            )
            conversations.append(conv)
            for u in (primary, peer):
                participants.append(
                    ConversationParticipant(
                        conversation_id=conv.id,
                        user_id=u.id,
                        role="member",
                        joined_at=now,
                    )
                )

            for u in (primary, peer):
                ucs_records.append(
                    UserConversationState(
                        user_id=u.id,
                        conversation_id=conv.id,
                        is_pinned=u is primary and random.random() < pinned_ratio,
                        is_muted=random.random() < muted_ratio,
                        pinned_at=now if (u is primary and random.random() < pinned_ratio) else None,
                        unread_count=random.randint(0, 8) if u is primary else 0,
                    )
                )

            messages.extend(_make_messages(conv, [primary, peer], msgs_per_conv, now))

        for _ in range(group_count):
            group_size = random.randint(3, 8)
            members = random.sample(users, k=min(group_size, len(users)))
            if primary not in members:
                members[0] = primary
            conv = Conversation(
                id=new_ulid(),
                type="group",
                title=faker.catch_phrase(),
                avatar_url=f"https://picsum.photos/seed/{faker.uuid4()}/96",
                last_activity_at=_random_recent(now),
                created_at=now,
                updated_at=now,
            )
            conversations.append(conv)
            for u in members:
                participants.append(
                    ConversationParticipant(
                        conversation_id=conv.id,
                        user_id=u.id,
                        role="member",
                        joined_at=now,
                    )
                )
                ucs_records.append(
                    UserConversationState(
                        user_id=u.id,
                        conversation_id=conv.id,
                        is_pinned=u is primary and random.random() < pinned_ratio,
                        is_muted=random.random() < muted_ratio,
                        pinned_at=now if (u is primary and random.random() < pinned_ratio) else None,
                        unread_count=random.randint(0, 30) if u is primary else 0,
                    )
                )
            messages.extend(_make_messages(conv, members, msgs_per_conv, now))

        s.add_all(conversations)
        s.add_all(participants)
        s.add_all(ucs_records)
        await s.flush()

        BATCH = 5000
        for i in range(0, len(messages), BATCH):
            s.add_all(messages[i : i + BATCH])
            await s.flush()

        await s.commit()

    return primary_id


def _random_recent(now: datetime) -> datetime:
    return now - timedelta(minutes=random.randint(0, 60 * 24 * 14))


def _make_messages(
    conv: Conversation,
    members: list[User],
    count_range: tuple[int, int],
    now: datetime,
) -> list[Message]:
    out: list[Message] = []
    n = random.randint(*count_range)
    for _ in range(n):
        sender = random.choice(members)
        sent_at = conv.last_activity_at - timedelta(minutes=random.randint(0, 60 * 24 * 7))
        out.append(
            Message(
                id=new_ulid(),
                conversation_id=conv.id,
                sender_id=sender.id,
                content={"kind": "text", "text": faker.sentence(nb_words=random.randint(2, 16))},
                client_id=None,
                status="sent",
                sent_at=sent_at,
            )
        )
    out.sort(key=lambda m: m.sent_at)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="imcl-seed")
    parser.add_argument("mode", choices=["demo", "bench", "reset"])
    parser.add_argument("--primary-user-id", default=None)
    args = parser.parse_args(argv)

    settings = get_settings()
    db = Database(settings.database_url)

    async def run() -> str | None:
        if args.mode == "reset":
            await reset(db)
            await db.dispose()
            return None
        if args.mode == "demo":
            uid = await seed(
                db,
                user_count=50,
                direct_count=80,
                group_count=20,
                msgs_per_conv=(20, 80),
                primary_user_id=args.primary_user_id,
            )
        else:
            uid = await seed(
                db,
                user_count=200,
                direct_count=600,
                group_count=400,
                msgs_per_conv=(50, 200),
                primary_user_id=args.primary_user_id,
            )
        await db.dispose()
        return uid

    uid = asyncio.run(run())
    if uid:
        print(f"Seeded. Primary user_id = {uid}")
        print(f"Use header: X-Dev-User-Id: {uid}")
    else:
        print("Reset complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
