from __future__ import annotations

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from tests._helpers import add_message, make_direct_conversation, make_user


async def test_list_messages_newest_first_with_cursor(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    base = datetime.now(timezone.utc)
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        me = await make_user(s, "Me")
        peer = await make_user(s, "Peer")
        cid = await make_direct_conversation(s, me, peer)
        for i in range(15):
            await add_message(
                s,
                conversation_id=cid,
                sender_id=peer if i % 2 else me,
                text=f"msg-{i}",
                sent_at=base - timedelta(minutes=20 - i),
            )
        await s.commit()

    r = await client.get(
        f"/v1/conversations/{cid}/messages",
        params={"limit": 10},
        headers={"X-Dev-User-Id": me},
    )
    assert r.status_code == 200
    page1 = r.json()
    assert len(page1["items"]) == 10
    assert page1["has_more"] is True
    assert page1["next_cursor"] is not None

    texts1 = [m["content"]["text"] for m in page1["items"]]
    assert texts1 == [f"msg-{i}" for i in range(14, 4, -1)]

    r = await client.get(
        f"/v1/conversations/{cid}/messages",
        params={"limit": 10, "cursor": page1["next_cursor"]},
        headers={"X-Dev-User-Id": me},
    )
    assert r.status_code == 200
    page2 = r.json()
    assert len(page2["items"]) == 5
    assert page2["has_more"] is False
    texts2 = [m["content"]["text"] for m in page2["items"]]
    assert texts2 == [f"msg-{i}" for i in range(4, -1, -1)]
