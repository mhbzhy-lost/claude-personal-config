from __future__ import annotations

from datetime import datetime, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import User
from app.ulid_utils import new_ulid


async def _make_user(s: AsyncSession, name: str = "Test") -> str:
    now = datetime.now(timezone.utc)
    uid = new_ulid()
    s.add(User(id=uid, name=name, created_at=now, updated_at=now))
    await s.flush()
    return uid


async def _setup_user(engine: AsyncEngine, name: str = "Test") -> str:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        uid = await _make_user(s, name)
        await s.commit()
    return uid


async def test_list_empty_thread(client: AsyncClient) -> None:
    r = await client.get(
        "/v1/comments",
        params={"resource_type": "article", "resource_id": new_ulid()},
    )
    assert r.status_code == 200
    assert r.json() == {"items": [], "total": 0}


async def test_post_root_comment_anonymous_rejected(client: AsyncClient) -> None:
    r = await client.post(
        "/v1/comments",
        json={
            "resource_type": "article",
            "resource_id": new_ulid(),
            "content": "hi",
        },
    )
    assert r.status_code == 401


async def test_post_root_comment(client: AsyncClient, engine: AsyncEngine) -> None:
    uid = await _setup_user(engine)
    rid = new_ulid()
    r = await client.post(
        "/v1/comments",
        headers={"X-Dev-User-Id": uid},
        json={"resource_type": "article", "resource_id": rid, "content": "first"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["content"] == "first"
    assert body["depth"] == 0
    assert body["parent_comment_id"] is None
    assert body["is_deleted"] is False


async def test_post_reply_increments_depth(client: AsyncClient, engine: AsyncEngine) -> None:
    uid = await _setup_user(engine)
    rid = new_ulid()
    root = await client.post(
        "/v1/comments",
        headers={"X-Dev-User-Id": uid},
        json={"resource_type": "article", "resource_id": rid, "content": "root"},
    )
    reply = await client.post(
        "/v1/comments",
        headers={"X-Dev-User-Id": uid},
        json={
            "resource_type": "article",
            "resource_id": rid,
            "parent_comment_id": root.json()["id"],
            "content": "reply",
        },
    )
    assert reply.status_code == 201
    assert reply.json()["depth"] == 1
    assert reply.json()["parent_comment_id"] == root.json()["id"]


async def test_reply_depth_cap(client: AsyncClient, engine: AsyncEngine) -> None:
    uid = await _setup_user(engine)
    rid = new_ulid()
    parent_id: str | None = None
    # Build 4-level chain — 4th should fail (depth 0/1/2/3 OK, 4 rejected).
    for depth in range(4):
        r = await client.post(
            "/v1/comments",
            headers={"X-Dev-User-Id": uid},
            json={
                "resource_type": "article",
                "resource_id": rid,
                "parent_comment_id": parent_id,
                "content": f"depth {depth}",
            },
        )
        assert r.status_code == 201
        parent_id = r.json()["id"]
    # 5th level should be rejected
    r = await client.post(
        "/v1/comments",
        headers={"X-Dev-User-Id": uid},
        json={
            "resource_type": "article",
            "resource_id": rid,
            "parent_comment_id": parent_id,
            "content": "too deep",
        },
    )
    assert r.status_code == 422
    assert r.json()["code"] == "comment.depth_exceeded"


async def test_reply_to_parent_on_different_resource_404(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    uid = await _setup_user(engine)
    rid1, rid2 = new_ulid(), new_ulid()
    root = await client.post(
        "/v1/comments",
        headers={"X-Dev-User-Id": uid},
        json={"resource_type": "article", "resource_id": rid1, "content": "root"},
    )
    r = await client.post(
        "/v1/comments",
        headers={"X-Dev-User-Id": uid},
        json={
            "resource_type": "article",
            "resource_id": rid2,  # different host
            "parent_comment_id": root.json()["id"],
            "content": "stranger",
        },
    )
    assert r.status_code == 404
    assert r.json()["code"] == "comment.parent_not_found"


async def test_list_returns_tree_with_reply_counts(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    uid = await _setup_user(engine)
    rid = new_ulid()
    root = await client.post(
        "/v1/comments", headers={"X-Dev-User-Id": uid},
        json={"resource_type": "article", "resource_id": rid, "content": "r"},
    )
    root_id = root.json()["id"]
    for i in range(3):
        await client.post(
            "/v1/comments", headers={"X-Dev-User-Id": uid},
            json={
                "resource_type": "article",
                "resource_id": rid,
                "parent_comment_id": root_id,
                "content": f"reply {i}",
            },
        )
    r = await client.get(
        "/v1/comments", params={"resource_type": "article", "resource_id": rid}
    )
    body = r.json()
    assert body["total"] == 4
    root_in_list = next(c for c in body["items"] if c["id"] == root_id)
    assert root_in_list["reply_count"] == 3


async def test_delete_own_comment(client: AsyncClient, engine: AsyncEngine) -> None:
    uid = await _setup_user(engine)
    rid = new_ulid()
    r = await client.post(
        "/v1/comments", headers={"X-Dev-User-Id": uid},
        json={"resource_type": "article", "resource_id": rid, "content": "x"},
    )
    cid = r.json()["id"]
    d = await client.delete(f"/v1/comments/{cid}", headers={"X-Dev-User-Id": uid})
    assert d.status_code == 204

    listing = await client.get(
        "/v1/comments", params={"resource_type": "article", "resource_id": rid}
    )
    # Deleted comments still in list (so tree structure preserved), but with
    # is_deleted=true and empty content.
    body = listing.json()
    assert body["total"] == 1
    assert body["items"][0]["is_deleted"] is True
    assert body["items"][0]["content"] == ""


async def test_delete_others_comment_403(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    owner = await _setup_user(engine, "Owner")
    intruder = await _setup_user(engine, "Intruder")
    rid = new_ulid()
    r = await client.post(
        "/v1/comments", headers={"X-Dev-User-Id": owner},
        json={"resource_type": "article", "resource_id": rid, "content": "mine"},
    )
    d = await client.delete(
        f"/v1/comments/{r.json()['id']}", headers={"X-Dev-User-Id": intruder}
    )
    assert d.status_code == 403
    assert d.json()["code"] == "comment.not_author"
