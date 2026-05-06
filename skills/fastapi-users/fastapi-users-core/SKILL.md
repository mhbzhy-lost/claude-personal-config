---
name: fastapi-users-core
description: Ready-to-use user management for FastAPI — registration, JWT/cookie auth, OAuth2, email verification, password reset, and current-user dependency injection
tech_stack: [fastapi]
language: [python]
capability: [auth, permission, web-framework]
version: "fastapi-users unversioned (maintenance mode)"
collected_at: 2025-07-15
---

# FastAPI Users

> Source: https://fastapi-users.github.io/fastapi-users/latest/ (configuration + usage sub-pages)

## Purpose

FastAPI Users is a pluggable user-authentication library for FastAPI. It gives you ready-made routes for register, login, logout, forgot/reset password, email verification, and social OAuth2 — plus a `current_user` dependency callable to inject the authenticated user (with active/verified/superuser guards) into your own routes.

**Status:** maintenance mode — security updates only, no new features. A successor toolkit is in development.

## When to Use

- You need a complete registration + auth system in a FastAPI project (not building from scratch).
- You want multiple authentication methods simultaneously (e.g. JWT for mobile API + cookies for browser sessions).
- You need built-in routes for login, logout, register, password reset, email verification.
- You need social OAuth2 login (Google, Facebook, etc.) with optional account linking.
- You want `current_user` dependency injection with `active`/`verified`/`superuser` guards.

## Basic Usage

### 1. Define the User model (SQLAlchemy)

```python
# app/db.py
from fastapi_users.db import SQLAlchemyBaseUserTableUUID, SQLAlchemyUserDatabase
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase): pass

class User(SQLAlchemyBaseUserTableUUID, Base): pass

# ... create async engine, sessionmaker, get_async_session ...

async def get_user_db(session=Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User)
```

### 2. Define schemas

```python
# app/schemas.py
from fastapi_users import schemas
import uuid

class UserRead(schemas.BaseUser[uuid.UUID]): pass
class UserCreate(schemas.BaseUserCreate): pass
class UserUpdate(schemas.BaseUserUpdate): pass
```

### 3. Wire UserManager + AuthBackend + FastAPIUsers

```python
# app/users.py
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin, models
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy

SECRET = "CHANGE-ME-TO-STRONG-PASSPHRASE"

class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET

    async def on_after_register(self, user, request=None):
        print(f"User {user.id} registered.")  # replace with real logic

    async def on_after_forgot_password(self, user, token, request=None):
        print(f"Reset token for {user.id}: {token}")  # send email here

    async def on_after_request_verify(self, user, token, request=None):
        print(f"Verify token for {user.id}: {token}")  # send email here

async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)

bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")

def get_jwt_strategy() -> JWTStrategy[models.UP, models.ID]:
    return JWTStrategy(secret=SECRET, lifetime_seconds=3600)

auth_backend = AuthenticationBackend(
    name="jwt", transport=bearer_transport, get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])
current_active_user = fastapi_users.current_user(active=True)
```

### 4. Register routers and use current_user

```python
# app/app.py
app = FastAPI()

app.include_router(fastapi_users.get_auth_router(auth_backend),         prefix="/auth/jwt")
app.include_router(fastapi_users.get_register_router(UserRead, UserCreate), prefix="/auth")
app.include_router(fastapi_users.get_reset_password_router(),            prefix="/auth")
app.include_router(fastapi_users.get_verify_router(UserRead),            prefix="/auth")
app.include_router(fastapi_users.get_users_router(UserRead, UserUpdate), prefix="/users")

@app.get("/protected")
async def protected(user: User = Depends(current_active_user)):
    return {"message": f"Hello {user.email}!"}
```

## Key APIs (Summary)

### Authentication backends: Transport + Strategy

| Transport | Token carriage | Best for |
|---|---|---|
| `BearerTransport(tokenUrl)` | `Authorization: Bearer` header | Mobile apps, pure REST APIs |
| `CookieTransport(cookie_max_age=...)` | HTTP cookie | Browser-based web frontends |

| Strategy | Token storage | Revocable? |
|---|---|---|
| `JWTStrategy(secret, lifetime_seconds)` | Self-contained JWT | No (valid until expiry) |
| `DatabaseStrategy(database, lifetime_seconds)` | DB table/collection | Yes |
| `RedisStrategy(redis, lifetime_seconds)` | Redis key-store | Yes |

Multiple backends can be stacked; the first that yields a user wins.

### UserManager lifecycle hooks (override in your subclass)

| Hook | When called | Typical use |
|---|---|---|
| `validate_password(password, user)` | Registration, password change | Raise `InvalidPasswordException(reason=...)` if weak |
| `on_after_register(user, request)` | After registration | Send welcome email |
| `on_after_login(user, request, response)` | After login | Analytics, login rewards |
| `on_after_forgot_password(user, token, request)` | After forgot-password request | Send reset email with token |
| `on_after_request_verify(user, token, request)` | After verification requested | Send verification email with token |
| `on_after_verify(user, request)` | After successful verification | Post-verification logic |
| `on_after_reset_password(user, request)` | After password reset | Notify user of change |
| `on_before_delete(user, request)` | Before user deletion | Cleanup related resources |
| `on_after_delete(user, request)` | After user deletion | Admin notification |

### ID parser mixins (must come FIRST in inheritance — MRO order)

- `UUIDIDMixin` — UUID primary keys
- `IntegerIDMixin` — auto-increment integer keys
- `ObjectIDIDMixin` — MongoDB ObjectID (from `fastapi_users_db_beanie`)
- Or override `parse_id(self, value)`, raising `InvalidID` on failure

### current_user dependency variants

```python
current_user          = fastapi_users.current_user()                             # any authenticated user
current_active_user   = fastapi_users.current_user(active=True)                  # + must be active
current_verified_user = fastapi_users.current_user(active=True, verified=True)   # + must be verified
current_superuser     = fastapi_users.current_user(active=True, superuser=True)  # + must be superuser
```

### OAuth2 quick setup

```python
# 1. Install: pip install 'fastapi-users[sqlalchemy,oauth]'
# 2. Create OAuth client
from httpx_oauth.clients.google import GoogleOAuth2
google_client = GoogleOAuth2("CLIENT_ID", "CLIENT_SECRET")

# 3. Add OAuthAccount to User model
from fastapi_users.db import SQLAlchemyBaseOAuthAccountTableUUID
class OAuthAccount(SQLAlchemyBaseOAuthAccountTableUUID, Base): pass
class User(SQLAlchemyBaseUserTableUUID, Base):
    oauth_accounts: Mapped[list[OAuthAccount]] = relationship("OAuthAccount", lazy="joined")

# 4. Pass OAuthAccount to DB adapter
SQLAlchemyUserDatabase(session, User, OAuthAccount)

# 5. Register router
app.include_router(
    fastapi_users.get_oauth_router(google_client, auth_backend, SECRET),
    prefix="/auth/google",
)
```

## Caveats

- **Maintenance mode** — no new features. Plan migration path for long-lived projects.
- **SECRET must be strong** — the same secret secures JWT tokens, reset tokens, and verification tokens. Use a long random passphrase.
- **JWT is not revocable** — prefer `DatabaseStrategy` or `RedisStrategy` if you need server-side token invalidation (e.g., forced logout).
- **Cookie transport needs CSRF protection** — the library does NOT include CSRF middleware; add it yourself for cookie-based auth.
- **Inheritance order matters** — `UUIDIDMixin` (or equivalent) must be the left-most base class of `UserManager` for MRO to work correctly.
- **OAuth `associate_by_email=True` is dangerous** — only enable if the OAuth provider verifies emails. Otherwise a malicious user can hijack accounts by creating an OAuth identity with the victim's email.
- **OAuth `is_verified_by_default=True`** — only enable if the provider verifies emails.
- **User enumeration protection** — `/forgot-password` and `/request-verify-token` always return 202 even if the user doesn't exist. Do NOT leak existence via timing or other side channels in your hook overrides.
- **Users router guards** — `GET/PATCH/DELETE /{user_id}` require superuser. `GET/PATCH /me` are available to any authenticated user.
- **CSRF cookie defaults to `secure=True`** — for local dev without HTTPS, set `csrf_token_cookie_secure=False` on the OAuth router.
- **Type generics are mandatory** — `FastAPIUsers[User, ID]`, `BaseUserManager[User, ID]`, and schema base classes all expect `[User, ID]` type parameters for correct typing.

## Composition Hints

- **Database adapter**: Use `SQLAlchemyBaseUserTableUUID` for UUID PKs or `SQLAlchemyBaseUserTable` + custom `id` column for integers. For MongoDB, use `BeanieBaseUser` with Beanie `Document`.
- **Multiple auth backends**: Define separate `AuthenticationBackend` instances (e.g. one JWT + Bearer, one JWT + Cookie). Pass all to `FastAPIUsers`. Register an auth router for each backend with distinct prefixes.
- **Dynamic backend selection**: Use `get_enabled_backends` callable on `current_user()` to conditionally enable backends per-request (e.g. JWT-only on certain routes).
- **Custom password validation**: Override `validate_password` to enforce rules (length, complexity, no email-in-password, pwned-password check).
- **Email sending**: Implement real email delivery in `on_after_register`, `on_after_forgot_password`, and `on_after_request_verify` hooks. The library only provides the tokens; you must send them.
- **OAuth association for existing users**: Use `get_oauth_associate_router` to let already-authenticated users link additional OAuth providers to their account.
- **Beanie (MongoDB)**: Same patterns as SQLAlchemy but `OAuthAccount` is a plain Pydantic model embedded in the User document (not a separate Beanie document).
