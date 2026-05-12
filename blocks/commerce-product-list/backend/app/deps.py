from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthBackend, bearer_scheme, get_dev_user_header
from app.config import Settings
from app.db import Database
from app.errors import unauthorized


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings  # type: ignore[no-any-return]


def get_database(request: Request) -> Database:
    return request.app.state.database  # type: ignore[no-any-return]


def get_auth_backend(request: Request) -> AuthBackend:
    return request.app.state.auth_backend  # type: ignore[no-any-return]


async def get_session(
    db: Annotated[Database, Depends(get_database)],
) -> AsyncIterator[AsyncSession]:
    async with db.session() as session:
        yield session


async def get_optional_user_id(
    auth: Annotated[AuthBackend, Depends(get_auth_backend)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    dev_user_header: Annotated[str | None, Depends(get_dev_user_header)],
) -> str | None:
    """Returns user_id when authenticated, None for anonymous browsing."""
    return await auth.authenticate(credentials, dev_user_header)


async def require_user_id(
    user_id: Annotated[str | None, Depends(get_optional_user_id)],
) -> str:
    if user_id is None:
        raise unauthorized(detail="Authentication required for this action")
    return user_id


SessionDep = Annotated[AsyncSession, Depends(get_session)]
OptionalUserId = Annotated[str | None, Depends(get_optional_user_id)]
RequiredUserId = Annotated[str, Depends(require_user_id)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
