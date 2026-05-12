from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthBackend, bearer_scheme, get_dev_user_header
from app.config import Settings
from app.db import Database


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


async def get_current_user_id(
    auth: Annotated[AuthBackend, Depends(get_auth_backend)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    dev_user_header: Annotated[str | None, Depends(get_dev_user_header)],
) -> str:
    return await auth.authenticate(credentials, dev_user_header)


def get_idempotency_key(
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> str | None:
    return idempotency_key


SessionDep = Annotated[AsyncSession, Depends(get_session)]
CurrentUserId = Annotated[str, Depends(get_current_user_id)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
IdempotencyKey = Annotated[str | None, Depends(get_idempotency_key)]
