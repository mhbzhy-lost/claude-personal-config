from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import RequiredUserId, SessionDep
from app.errors import not_found
from app.models import User as UserModel
from app.schemas.user import User

router = APIRouter(tags=["Me"])


@router.get("/me", response_model=User)
async def get_me(user_id: RequiredUserId, session: SessionDep) -> User:
    stmt = select(UserModel).where(UserModel.id == user_id)
    user = (await session.execute(stmt)).scalar_one_or_none()
    if user is None:
        raise not_found("user.not_found")
    return User(id=user.id, name=user.name, avatar_url=user.avatar_url)
