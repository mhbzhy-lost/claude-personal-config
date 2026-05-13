"""
Stub user-profile endpoints — returns canned mock data so the block can be
booted as-is for shape verification. Real domain implementation
(persistence, follow/unfollow business rules, profile edit, posts feed) is
the host's responsibility after copying this block.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.errors import not_found

router = APIRouter(tags=["Profiles"])


_MOCK: dict[str, dict] = {
    "01JBUSERDEMO001": {
        "id": "01JBUSERDEMO001",
        "name": "Alice Chen",
        "handle": "alicechen",
        "avatar": "https://i.pravatar.cc/160?u=alice",
        "cover": "https://picsum.photos/seed/cover1/1200/300",
        "bio": "前端工程师 · 摄影爱好者 · 喜欢咖啡和小猫",
        "location": "上海",
        "website": "https://alice.example.com",
        "joined_at": "2023-06-12T00:00:00Z",
        "stats": {
            "posts": 128,
            "followers": 2480,
            "following": 312,
        },
        "is_following": False,
        "is_self": False,
        "verified": True,
    },
}


@router.get("/users/{user_id}")
async def get_user_profile(user_id: str) -> dict:
    item = _MOCK.get(user_id)
    if not item:
        raise not_found("user.not_found")
    return item
