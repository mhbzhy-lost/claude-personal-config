from __future__ import annotations

from typing import Protocol

import jwt
from fastapi import Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings
from app.errors import unauthorized
from app.ulid_utils import is_ulid


class AuthBackend(Protocol):
    async def authenticate(
        self,
        credentials: HTTPAuthorizationCredentials | None,
        dev_user_header: str | None,
    ) -> str:
        """Resolve the authenticated user_id (ULID). Raise unauthorized() on failure."""


class DevAuthBackend:
    """Trusts the `X-Dev-User-Id` header. NEVER enable in production."""

    async def authenticate(
        self,
        credentials: HTTPAuthorizationCredentials | None,
        dev_user_header: str | None,
    ) -> str:
        if not dev_user_header or not is_ulid(dev_user_header):
            raise unauthorized(detail="Missing or invalid X-Dev-User-Id (dev auth mode)")
        return dev_user_header


class JwtAuthBackend:
    def __init__(self, settings: Settings) -> None:
        if settings.jwt_public_key is None:
            raise RuntimeError("IMCL_JWT_PUBLIC_KEY is required when IMCL_AUTH_MODE=jwt")
        self._public_key = settings.jwt_public_key.get_secret_value()
        self._algorithm = settings.jwt_algorithm
        self._audience = settings.jwt_audience
        self._issuer = settings.jwt_issuer

    async def authenticate(
        self,
        credentials: HTTPAuthorizationCredentials | None,
        dev_user_header: str | None,
    ) -> str:
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise unauthorized(detail="Bearer token required")
        try:
            payload = jwt.decode(
                credentials.credentials,
                self._public_key,
                algorithms=[self._algorithm],
                audience=self._audience,
                issuer=self._issuer,
            )
        except jwt.PyJWTError as exc:
            raise unauthorized(detail=str(exc)) from exc
        sub = payload.get("sub")
        if not isinstance(sub, str) or not is_ulid(sub):
            raise unauthorized(code="invalid_subject", detail="JWT sub must be a ULID")
        return sub


def make_auth_backend(settings: Settings) -> AuthBackend:
    if settings.auth_mode == "dev":
        return DevAuthBackend()
    return JwtAuthBackend(settings)


bearer_scheme = HTTPBearer(auto_error=False)


def get_dev_user_header(x_dev_user_id: str | None = Header(default=None)) -> str | None:
    return x_dev_user_id
