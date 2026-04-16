---
name: python-im-server
description: "IM 系统 Python 后端实现层：FastAPI REST API + python-socketio 实时通信 + SQLAlchemy ORM + Redis Pub/Sub。协议定义见 im-protocol-core。"
tech_stack: [fastapi, python-socketio, im, backend, redis, postgresql]
language: [python]
---

# IM Python 后端实现层

> 本 skill 覆盖 IM 系统 Python 后端的完整实现代码。
> 公共协议（消息类型、Socket 事件、数据库 Schema、安全模式）定义在 `im-protocol-core`。
> 配套前端实现参考 `react-im-client`。

---

## 1. 项目结构

```
im-server/
├── pyproject.toml
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI + SocketIO 入口
│   ├── config.py                # 配置管理（pydantic-settings）
│   ├── dependencies.py          # FastAPI 依赖注入
│   ├── models/                  # SQLAlchemy ORM 模型
│   │   ├── __init__.py
│   │   ├── base.py              # DeclarativeBase + 通用 Mixin
│   │   ├── user.py
│   │   ├── conversation.py
│   │   ├── conversation_member.py
│   │   └── message.py
│   ├── schemas/                 # Pydantic 请求/响应 Schema
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── conversation.py
│   │   └── message.py
│   ├── api/                     # REST API 路由
│   │   ├── __init__.py
│   │   ├── router.py            # 总路由聚合
│   │   ├── auth.py
│   │   ├── conversations.py
│   │   ├── messages.py
│   │   ├── upload.py
│   │   └── users.py
│   ├── sio/                     # Socket.IO 事件处理
│   │   ├── __init__.py
│   │   ├── server.py            # sio 实例创建
│   │   ├── middleware.py        # 连接认证中间件
│   │   └── events.py            # 所有事件 handler
│   ├── services/                # 业务逻辑层
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── conversation_service.py
│   │   ├── message_service.py
│   │   ├── upload_service.py
│   │   └── presence_service.py
│   ├── core/                    # 基础设施
│   │   ├── __init__.py
│   │   ├── database.py          # async engine + session factory
│   │   ├── redis.py             # Redis 连接池
│   │   ├── security.py          # JWT 工具
│   │   └── rate_limit.py        # 速率限制
│   └── utils/
│       ├── __init__.py
│       └── image.py             # 缩略图生成
└── tests/
    ├── conftest.py
    ├── test_api/
    └── test_sio/
```

**关键原则**：

- `models/` 只定义 ORM 映射，不包含业务逻辑
- `schemas/` 只定义 Pydantic 验证模型，用于 API 层出入参
- `services/` 封装业务逻辑，同时被 REST 路由和 Socket.IO handler 调用
- `sio/` 和 `api/` 平级，共享 `services/` 层

---

## 2. 应用初始化

### 2.1 配置管理

```python
# app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # 应用
    app_name: str = "IM Server"
    debug: bool = False

    # 数据库
    database_url: str = "postgresql+asyncpg://user:pass@localhost:5432/im"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # 文件上传
    upload_dir: str = "./uploads"
    max_upload_size: int = 50 * 1024 * 1024  # 50MB
    thumbnail_size: tuple[int, int] = (200, 200)

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
```

### 2.2 数据库连接

```python
# app/core/database.py
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # 避免 detached instance 问题
)


async def get_session() -> AsyncGenerator[AsyncSession]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### 2.3 Redis 连接

```python
# app/core/redis.py
from redis.asyncio import ConnectionPool, Redis

from app.config import settings

pool = ConnectionPool.from_url(settings.redis_url, decode_responses=True)


def get_redis() -> Redis:
    return Redis(connection_pool=pool)


async def close_redis() -> None:
    await pool.aclose()
```

### 2.4 Socket.IO 实例

```python
# app/sio/server.py
import socketio

from app.config import settings

# 生产环境使用 Redis manager 实现跨进程广播
# 开发环境可省略 client_manager 参数
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.cors_origins,
    # 跨进程广播：多实例部署必须配置
    client_manager=socketio.AsyncRedisManager(settings.redis_url),
    logger=settings.debug,
    engineio_logger=settings.debug,
)

# 注意：不要在此处创建 ASGIApp，在 main.py 中挂载
```

### 2.5 应用入口

```python
# app/main.py
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.core.database import engine
from app.core.redis import close_redis, get_redis
from app.api.router import api_router
from app.sio.server import sio
from app.sio.middleware import register_sio_middleware
from app.sio.events import register_sio_events


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """应用生命周期：启动时连接基础设施，关闭时清理资源。"""
    # --- 启动 ---
    redis = get_redis()
    await redis.ping()  # 验证 Redis 连接
    # 注册 Socket.IO 中间件和事件
    register_sio_middleware(sio)
    register_sio_events(sio)
    yield
    # --- 关闭 ---
    await engine.dispose()
    await close_redis()


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST API 路由
app.include_router(api_router, prefix="/api")

# 静态文件（上传文件访问）
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

# Socket.IO 挂载 —— 必须使用 socketio.ASGIApp 包装
# socket_path 默认为 "/socket.io/"，客户端连接时 path 需一致
socket_app = socketio.ASGIApp(
    sio,
    other_app=app,  # 非 Socket.IO 请求 fallback 到 FastAPI
    socketio_path="/socket.io/",
)

# uvicorn 入口指向 socket_app 而非 app：
# uvicorn app.main:socket_app --host 0.0.0.0 --port 8000
```

### 2.6 路由聚合

```python
# app/api/router.py
from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.conversations import router as conversations_router
from app.api.messages import router as messages_router
from app.api.upload import router as upload_router
from app.api.users import router as users_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(conversations_router, prefix="/conversations", tags=["conversations"])
api_router.include_router(messages_router, prefix="/messages", tags=["messages"])
api_router.include_router(upload_router, prefix="/upload", tags=["upload"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
```

---

## 3. 数据库模型（SQLAlchemy 2.0）

### 3.1 基础类

```python
# app/models/base.py
import uuid
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    """通用时间戳字段。"""

    created_at: Mapped[datetime] = mapped_column(
        default=func.now(),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        default=None,
        onupdate=func.now(),
    )


class UUIDPrimaryKeyMixin:
    """UUID 主键。"""

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
```

### 3.2 User 模型

```python
# app/models/user.py
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    nickname: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(default=None)
    # 密码哈希存储（bcrypt），认证时比对
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)

    # 关系
    memberships: Mapped[list[ConversationMember]] = relationship(
        back_populates="user", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<User {self.username}>"
```

### 3.3 Conversation 模型

```python
# app/models/conversation.py
from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Conversation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("type IN ('direct', 'group')", name="ck_conversation_type"),
    )

    type: Mapped[str] = mapped_column(String(10), nullable=False)
    name: Mapped[str | None] = mapped_column(String(200), default=None)
    avatar_url: Mapped[str | None] = mapped_column(default=None)

    # 关系
    members: Mapped[list[ConversationMember]] = relationship(
        back_populates="conversation",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation",
        lazy="noload",  # 消息列表不随会话加载
    )
```

### 3.4 ConversationMember 模型

```python
# app/models/conversation_member.py
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (
        Index("idx_conv_members_user", "user_id"),
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    joined_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow,
    )
    pinned_at: Mapped[datetime | None] = mapped_column(default=None)
    muted_until: Mapped[datetime | None] = mapped_column(default=None)
    last_read_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow,
    )

    # 关系
    conversation: Mapped[Conversation] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")
```

### 3.5 Message 模型

```python
# app/models/message.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Message(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("idx_messages_conv_time", "conversation_id", "created_at", postgresql_using="btree"),
        UniqueConstraint("client_id", name="idx_messages_client_id"),
    )

    client_id: Mapped[str] = mapped_column(String(36), nullable=False)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    reply_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("messages.id"),
        default=None,
    )
    mentions: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)),
        default=list,
    )
    recalled_at: Mapped[datetime | None] = mapped_column(default=None)

    # 关系
    conversation: Mapped[Conversation] = relationship(back_populates="messages")
    sender: Mapped[User] = relationship(lazy="joined")
```

### 3.6 模型聚合导出

```python
# app/models/__init__.py
from app.models.base import Base
from app.models.user import User
from app.models.conversation import Conversation
from app.models.conversation_member import ConversationMember
from app.models.message import Message

__all__ = ["Base", "User", "Conversation", "ConversationMember", "Message"]
```

---

## 4. Pydantic Schema

### 4.1 认证 Schema

```python
# app/schemas/auth.py
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str
```

### 4.2 用户 Schema

```python
# app/schemas/user.py
import uuid
from datetime import datetime

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    nickname: str
    avatar_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
```

### 4.3 会话 Schema

```python
# app/schemas/conversation.py
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.message import MessageResponse
from app.schemas.user import UserResponse


class ConversationCreate(BaseModel):
    type: str = Field(pattern=r"^(direct|group)$")
    member_ids: list[uuid.UUID] = Field(min_length=1)
    name: str | None = Field(default=None, max_length=200)


class ConversationUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    pinned_at: datetime | None = None
    muted_until: datetime | None = None


class MemberAdd(BaseModel):
    user_ids: list[uuid.UUID] = Field(min_length=1)


class ConversationResponse(BaseModel):
    id: uuid.UUID
    type: str
    name: str | None = None
    avatar_url: str | None = None
    members: list[UserResponse] = []
    last_message: MessageResponse | None = None
    unread_count: int = 0
    pinned_at: datetime | None = None
    muted_until: datetime | None = None
    updated_at: datetime

    model_config = {"from_attributes": True}
```

### 4.4 消息 Schema

```python
# app/schemas/message.py
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class MessageCreate(BaseModel):
    """REST API 消息创建（备用通道，主通道为 Socket.IO）。"""
    client_id: str = Field(max_length=36)
    type: str = Field(pattern=r"^(text|image|file|audio|video|system|recall)$")
    content: dict[str, Any]
    reply_to: uuid.UUID | None = None
    mentions: list[uuid.UUID] = Field(default_factory=list)


class MessageResponse(BaseModel):
    id: uuid.UUID
    client_id: str
    conversation_id: uuid.UUID
    sender_id: uuid.UUID
    type: str
    content: dict[str, Any]
    reply_to: uuid.UUID | None = None
    mentions: list[uuid.UUID] = []
    created_at: datetime
    updated_at: datetime | None = None
    recalled_at: datetime | None = None

    model_config = {"from_attributes": True}


class MessageSyncResponse(BaseModel):
    """消息同步响应，用于重连后批量拉取。"""
    messages: list[MessageResponse]
    has_more: bool
```

---

## 5. 认证中间件

### 5.1 JWT 工具

```python
# app/core/security.py
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes,
    )
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days,
    )
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """解码并验证 JWT，失败时抛出 JWTError。"""
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )


def get_user_id_from_token(token: str, expected_type: str = "access") -> uuid.UUID:
    """从 token 中提取 user_id，同时校验 token 类型。"""
    payload = decode_token(token)
    if payload.get("type") != expected_type:
        raise JWTError(f"Expected token type '{expected_type}', got '{payload.get('type')}'")
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise JWTError("Token missing 'sub' claim")
    return uuid.UUID(user_id_str)
```

### 5.2 FastAPI 依赖注入

```python
# app/dependencies.py
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_user_id_from_token
from app.models.user import User

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    """从 Authorization header 中解析 JWT 并返回当前用户。"""
    try:
        user_id = get_user_id_from_token(credentials.credentials, expected_type="access")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user
```

### 5.3 Socket.IO 连接认证中间件

```python
# app/sio/middleware.py
import socketio
from jose import JWTError

from app.core.security import get_user_id_from_token


def register_sio_middleware(sio: socketio.AsyncServer) -> None:
    """注册 Socket.IO 连接认证中间件。

    客户端连接时必须在 auth 中传递 token：
        io("ws://host", { auth: { token: "eyJ..." } })

    认证通过后 user_id 存入 session：
        session = await sio.get_session(sid)
        user_id = session["user_id"]
    """

    @sio.event
    async def connect(sid: str, environ: dict, auth: dict | None) -> bool:
        if not auth or "token" not in auth:
            raise socketio.exceptions.ConnectionRefusedError("Missing auth token")

        try:
            user_id = get_user_id_from_token(auth["token"], expected_type="access")
        except JWTError:
            raise socketio.exceptions.ConnectionRefusedError("Invalid or expired token")

        # 将 user_id 存入 Socket.IO session
        await sio.save_session(sid, {"user_id": str(user_id)})

        # 将用户加入以 user_id 命名的房间，用于定向推送
        sio.enter_room(sid, f"user:{user_id}")

        return True  # 接受连接
```

### 5.4 认证路由（登录、刷新、登出）

```python
# app/api/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_user_id_from_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    stmt = select(User).where(User.username == body.username)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest) -> TokenResponse:
    """用 refreshToken 换取新的 accessToken + refreshToken。"""
    redis = get_redis()

    # 检查 refresh token 是否已被吊销
    revoked = await redis.get(f"revoked:{body.refresh_token}")
    if revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    try:
        user_id = get_user_id_from_token(body.refresh_token, expected_type="refresh")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # 吊销旧 refresh token（单次使用）
    await redis.set(
        f"revoked:{body.refresh_token}",
        "1",
        ex=60 * 60 * 24 * 8,  # 稍长于 refresh token 有效期
    )

    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest) -> None:
    """登出：吊销 refresh token。"""
    redis = get_redis()
    await redis.set(
        f"revoked:{body.refresh_token}",
        "1",
        ex=60 * 60 * 24 * 8,
    )
```

---

## 6. REST API 路由

### 6.1 会话 CRUD

```python
# app/api/conversations.py
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.redis import get_redis
from app.dependencies import get_current_user
from app.models.conversation import Conversation
from app.models.conversation_member import ConversationMember
from app.models.message import Message
from app.models.user import User
from app.schemas.conversation import (
    ConversationCreate,
    ConversationResponse,
    ConversationUpdate,
    MemberAdd,
)

router = APIRouter()


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ConversationResponse]:
    """获取当前用户的会话列表（按 updated_at 倒序）。"""
    stmt = (
        select(Conversation)
        .join(ConversationMember)
        .where(ConversationMember.user_id == current_user.id)
        .options(selectinload(Conversation.members).selectinload(ConversationMember.user))
        .order_by(Conversation.updated_at.desc())
    )
    result = await session.execute(stmt)
    conversations = result.scalars().unique().all()

    # 批量获取未读数（从 Redis 缓存）
    redis = get_redis()
    unread_map: dict[str, int] = {}
    if conversations:
        raw = await redis.hgetall(f"unread:{current_user.id}")
        unread_map = {k: int(v) for k, v in raw.items()}

    response = []
    for conv in conversations:
        # 获取最后一条消息
        last_msg_stmt = (
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        last_msg_result = await session.execute(last_msg_stmt)
        last_msg = last_msg_result.scalar_one_or_none()

        # 获取当前用户的成员信息（置顶、免打扰）
        member = next(
            (m for m in conv.members if m.user_id == current_user.id),
            None,
        )

        response.append(ConversationResponse(
            id=conv.id,
            type=conv.type,
            name=conv.name,
            avatar_url=conv.avatar_url,
            members=[
                {
                    "id": m.user.id,
                    "username": m.user.username,
                    "nickname": m.user.nickname,
                    "avatar_url": m.user.avatar_url,
                    "created_at": m.user.created_at,
                }
                for m in conv.members
            ],
            last_message=last_msg,
            unread_count=unread_map.get(str(conv.id), 0),
            pinned_at=member.pinned_at if member else None,
            muted_until=member.muted_until if member else None,
            updated_at=conv.updated_at or conv.created_at,
        ))

    return response


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ConversationResponse:
    """创建会话。"""
    # 确保创建者在成员列表中
    member_ids = set(body.member_ids)
    member_ids.add(current_user.id)

    # 单聊去重：检查是否已存在相同两人的 direct 会话
    if body.type == "direct":
        if len(member_ids) != 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Direct conversation requires exactly 2 members",
            )
        ids_list = list(member_ids)
        existing = await _find_existing_direct(session, ids_list[0], ids_list[1])
        if existing:
            return existing

    conversation = Conversation(type=body.type, name=body.name)
    session.add(conversation)
    await session.flush()  # 获取 conversation.id

    for uid in member_ids:
        session.add(ConversationMember(
            conversation_id=conversation.id,
            user_id=uid,
        ))

    await session.flush()

    return ConversationResponse(
        id=conversation.id,
        type=conversation.type,
        name=conversation.name,
        members=[],  # 简化返回，客户端可重新拉取
        updated_at=conversation.created_at,
    )


async def _find_existing_direct(
    session: AsyncSession,
    user_a: uuid.UUID,
    user_b: uuid.UUID,
) -> ConversationResponse | None:
    """查找两用户之间已存在的单聊会话。"""
    stmt = (
        select(Conversation)
        .join(ConversationMember)
        .where(
            Conversation.type == "direct",
            ConversationMember.user_id.in_([user_a, user_b]),
        )
        .group_by(Conversation.id)
        .having(func.count(ConversationMember.user_id) == 2)
    )
    result = await session.execute(stmt)
    conv = result.scalar_one_or_none()
    if conv:
        return ConversationResponse(
            id=conv.id,
            type=conv.type,
            name=conv.name,
            members=[],
            updated_at=conv.updated_at or conv.created_at,
        )
    return None


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ConversationResponse:
    """获取会话详情（需是会话成员）。"""
    conv = await _get_conversation_or_404(session, conversation_id, current_user.id)
    return ConversationResponse(
        id=conv.id,
        type=conv.type,
        name=conv.name,
        avatar_url=conv.avatar_url,
        members=[
            {
                "id": m.user.id,
                "username": m.user.username,
                "nickname": m.user.nickname,
                "avatar_url": m.user.avatar_url,
                "created_at": m.user.created_at,
            }
            for m in conv.members
        ],
        updated_at=conv.updated_at or conv.created_at,
    )


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: uuid.UUID,
    body: ConversationUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ConversationResponse:
    """更新会话信息（改名、置顶、免打扰）。"""
    conv = await _get_conversation_or_404(session, conversation_id, current_user.id)

    # 会话级别字段
    if body.name is not None:
        conv.name = body.name

    # 成员级别字段（置顶、免打扰是每个用户独立的）
    member = next(
        (m for m in conv.members if m.user_id == current_user.id),
        None,
    )
    if member:
        if body.pinned_at is not None:
            member.pinned_at = body.pinned_at
        if body.muted_until is not None:
            member.muted_until = body.muted_until

    await session.flush()
    return ConversationResponse(
        id=conv.id,
        type=conv.type,
        name=conv.name,
        updated_at=conv.updated_at or conv.created_at,
    )


@router.post("/{conversation_id}/members", status_code=status.HTTP_204_NO_CONTENT)
async def add_members(
    conversation_id: uuid.UUID,
    body: MemberAdd,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """添加群成员。"""
    conv = await _get_conversation_or_404(session, conversation_id, current_user.id)
    if conv.type != "group":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add members to direct conversation",
        )
    existing_ids = {m.user_id for m in conv.members}
    for uid in body.user_ids:
        if uid not in existing_ids:
            session.add(ConversationMember(
                conversation_id=conversation_id,
                user_id=uid,
            ))


@router.delete("/{conversation_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """移除群成员。"""
    conv = await _get_conversation_or_404(session, conversation_id, current_user.id)
    if conv.type != "group":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove members from direct conversation",
        )
    stmt = select(ConversationMember).where(
        ConversationMember.conversation_id == conversation_id,
        ConversationMember.user_id == user_id,
    )
    result = await session.execute(stmt)
    member = result.scalar_one_or_none()
    if member:
        await session.delete(member)


async def _get_conversation_or_404(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Conversation:
    """获取会话并验证用户是否为成员，否则返回 404。"""
    stmt = (
        select(Conversation)
        .options(selectinload(Conversation.members).selectinload(ConversationMember.user))
        .where(Conversation.id == conversation_id)
    )
    result = await session.execute(stmt)
    conv = result.scalar_one_or_none()

    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    is_member = any(m.user_id == user_id for m in conv.members)
    if not is_member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    return conv
```

### 6.2 消息历史（游标分页）

```python
# app/api/messages.py
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.dependencies import get_current_user
from app.models.conversation_member import ConversationMember
from app.models.message import Message
from app.models.user import User
from app.schemas.message import MessageResponse, MessageSyncResponse

router = APIRouter()


@router.get(
    "/{conversation_id}/messages",
    response_model=list[MessageResponse],
    # 注意：此路由挂在 conversations router 下
    # 但为清晰起见，这里展示完整路径逻辑
)
async def get_messages(
    conversation_id: uuid.UUID,
    before: datetime | None = Query(
        default=None,
        description="游标：返回早于此时间戳的消息（ISO 8601 或毫秒时间戳）",
    ),
    limit: int = Query(default=30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[MessageResponse]:
    """
    历史消息查询（游标分页）。

    - before 为空时返回最新消息
    - 返回按 created_at 正序排列（越早越前）
    - 当返回条数 < limit 时表示已到达历史起点
    """
    # 验证用户是否为会话成员
    await _verify_membership(session, conversation_id, current_user.id)

    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
    )

    if before is not None:
        stmt = stmt.where(Message.created_at < before)

    # 先按时间倒序取 limit 条，再反转为正序
    stmt = stmt.order_by(Message.created_at.desc()).limit(limit)

    result = await session.execute(stmt)
    messages = list(reversed(result.scalars().all()))

    return [MessageResponse.model_validate(m) for m in messages]


@router.get("/sync", response_model=MessageSyncResponse)
async def sync_messages(
    since: datetime = Query(description="返回此时间戳之后的所有消息"),
    limit: int = Query(default=200, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MessageSyncResponse:
    """
    消息同步接口（重连后批量拉取）。

    返回用户所有会话中 since 之后的消息，按 created_at 正序排列。
    """
    # 获取用户所在的所有会话 ID
    member_stmt = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == current_user.id,
    )
    member_result = await session.execute(member_stmt)
    conv_ids = [row[0] for row in member_result.all()]

    if not conv_ids:
        return MessageSyncResponse(messages=[], has_more=False)

    stmt = (
        select(Message)
        .where(
            Message.conversation_id.in_(conv_ids),
            Message.created_at > since,
        )
        .order_by(Message.created_at.asc())
        .limit(limit + 1)  # 多取一条判断 has_more
    )
    result = await session.execute(stmt)
    messages = result.scalars().all()

    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]

    return MessageSyncResponse(
        messages=[MessageResponse.model_validate(m) for m in messages],
        has_more=has_more,
    )


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def recall_message(
    message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """撤回消息（仅发送者本人，且在 2 分钟内）。"""
    msg = await session.get(Message, message_id)
    if msg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the sender")

    now = datetime.now(timezone.utc)
    if msg.created_at.tzinfo is None:
        msg_time = msg.created_at.replace(tzinfo=timezone.utc)
    else:
        msg_time = msg.created_at
    elapsed = (now - msg_time).total_seconds()
    if elapsed > 120:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only recall messages within 2 minutes",
        )

    msg.recalled_at = now
    await session.flush()


async def _verify_membership(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """验证用户是否为会话成员。"""
    stmt = select(ConversationMember).where(
        ConversationMember.conversation_id == conversation_id,
        ConversationMember.user_id == user_id,
    )
    result = await session.execute(stmt)
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
```

### 6.3 文件上传

```python
# app/api/upload.py
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.config import settings
from app.dependencies import get_current_user
from app.models.user import User
from app.utils.image import generate_thumbnail, get_image_dimensions

router = APIRouter()


class UploadResponse(BaseModel):
    url: str
    thumbnail: str | None = None
    width: int | None = None
    height: int | None = None
    file_name: str
    file_size: int
    mime_type: str | None = None


@router.post("", response_model=UploadResponse)
async def upload_file(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
) -> UploadResponse:
    """上传文件，返回访问 URL。图片类型额外生成缩略图。"""
    if file.size and file.size > settings.max_upload_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds {settings.max_upload_size // (1024*1024)}MB limit",
        )

    # 生成唯一文件名，保留原始扩展名
    ext = Path(file.filename or "").suffix
    unique_name = f"{uuid.uuid4().hex}{ext}"
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / unique_name

    # 写入文件
    content = await file.read()
    file_path.write_bytes(content)

    url = f"/uploads/{unique_name}"
    thumbnail_url: str | None = None
    width: int | None = None
    height: int | None = None

    # 图片处理：生成缩略图 + 获取尺寸
    mime = file.content_type or ""
    if mime.startswith("image/"):
        width, height = get_image_dimensions(content)
        thumb_name = f"thumb_{unique_name}"
        thumb_path = upload_dir / thumb_name
        generate_thumbnail(content, thumb_path, settings.thumbnail_size)
        thumbnail_url = f"/uploads/{thumb_name}"

    return UploadResponse(
        url=url,
        thumbnail=thumbnail_url,
        width=width,
        height=height,
        file_name=file.filename or unique_name,
        file_size=len(content),
        mime_type=mime or None,
    )
```

### 6.4 用户搜索

```python
# app/api/users.py
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import UserResponse

router = APIRouter()


@router.get("/search", response_model=list[UserResponse])
async def search_users(
    q: str = Query(min_length=1, max_length=50, description="搜索关键词"),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[UserResponse]:
    """按用户名或昵称模糊搜索用户。"""
    pattern = f"%{q}%"
    stmt = (
        select(User)
        .where(
            User.id != current_user.id,
            or_(
                User.username.ilike(pattern),
                User.nickname.ilike(pattern),
            ),
        )
        .limit(limit)
    )
    result = await session.execute(stmt)
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """获取当前用户信息。"""
    return UserResponse.model_validate(current_user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    """获取指定用户资料。"""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse.model_validate(user)
```

---

## 7. Socket.IO 事件处理

```python
# app/sio/events.py
import uuid
from datetime import datetime, timezone

import socketio
from sqlalchemy import select, func

from app.core.database import async_session_factory
from app.core.redis import get_redis
from app.models.conversation import Conversation
from app.models.conversation_member import ConversationMember
from app.models.message import Message


def register_sio_events(sio: socketio.AsyncServer) -> None:
    """注册所有 Socket.IO 事件处理器。"""

    # ------------------------------------------------------------------
    # message:send — 发送消息（持久化 + 广播 + ACK）
    # ------------------------------------------------------------------
    @sio.on("message:send")
    async def handle_message_send(sid: str, data: dict) -> dict:
        """
        客户端发送消息。

        data: { conversationId, clientId, type, content, replyTo?, mentions? }
        返回（ACK）: { success, messageId?, error? }
        """
        session_data = await sio.get_session(sid)
        sender_id = uuid.UUID(session_data["user_id"])

        conversation_id = uuid.UUID(data["conversationId"])
        client_id = data["clientId"]
        msg_type = data["type"]
        content = data["content"]
        reply_to = uuid.UUID(data["replyTo"]) if data.get("replyTo") else None
        mentions = [uuid.UUID(m) for m in data.get("mentions", [])]

        async with async_session_factory() as db:
            try:
                # 验证用户是否为会话成员
                membership = await db.execute(
                    select(ConversationMember).where(
                        ConversationMember.conversation_id == conversation_id,
                        ConversationMember.user_id == sender_id,
                    )
                )
                if membership.scalar_one_or_none() is None:
                    return {"success": False, "error": "Not a member of this conversation"}

                # client_id 幂等：如果已存在则直接返回成功
                existing = await db.execute(
                    select(Message).where(Message.client_id == client_id)
                )
                existing_msg = existing.scalar_one_or_none()
                if existing_msg:
                    return {"success": True, "messageId": str(existing_msg.id)}

                # 持久化消息
                message = Message(
                    client_id=client_id,
                    conversation_id=conversation_id,
                    sender_id=sender_id,
                    type=msg_type,
                    content=content,
                    reply_to=reply_to,
                    mentions=mentions,
                )
                db.add(message)

                # 更新会话的 updated_at
                conv = await db.get(Conversation, conversation_id)
                if conv:
                    conv.updated_at = datetime.now(timezone.utc)

                await db.commit()
                await db.refresh(message)

                # 构建 S2C 消息体（对应 im-protocol-core Message 类型）
                msg_payload = {
                    "id": str(message.id),
                    "clientId": message.client_id,
                    "conversationId": str(message.conversation_id),
                    "senderId": str(message.sender_id),
                    "type": message.type,
                    "content": message.content,
                    "status": "sent",
                    "createdAt": int(message.created_at.timestamp() * 1000),
                    "replyTo": str(message.reply_to) if message.reply_to else None,
                    "mentions": [str(m) for m in (message.mentions or [])],
                }

                # 广播到会话房间（通过 Redis Pub/Sub 跨进程）
                await sio.emit(
                    "message:new",
                    msg_payload,
                    room=f"conv:{conversation_id}",
                    skip_sid=sid,  # 不回发给发送者
                )

                # 更新未读数（Redis HINCRBY）
                redis = get_redis()
                members_result = await db.execute(
                    select(ConversationMember.user_id).where(
                        ConversationMember.conversation_id == conversation_id,
                        ConversationMember.user_id != sender_id,
                    )
                )
                for (member_id,) in members_result.all():
                    await redis.hincrby(
                        f"unread:{member_id}",
                        str(conversation_id),
                        1,
                    )

                return {"success": True, "messageId": str(message.id)}

            except Exception as e:
                await db.rollback()
                return {"success": False, "error": str(e)}

    # ------------------------------------------------------------------
    # message:read — 已读回执
    # ------------------------------------------------------------------
    @sio.on("message:read")
    async def handle_message_read(sid: str, data: dict) -> None:
        """
        标记已读。更新 last_read_at 并清除未读数。

        data: { conversationId, messageId }
        """
        session_data = await sio.get_session(sid)
        user_id = uuid.UUID(session_data["user_id"])
        conversation_id = uuid.UUID(data["conversationId"])
        message_id = uuid.UUID(data["messageId"])

        async with async_session_factory() as db:
            # 获取被标记消息的时间
            msg = await db.get(Message, message_id)
            if not msg:
                return

            # 更新 last_read_at
            member_stmt = select(ConversationMember).where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id,
            )
            result = await db.execute(member_stmt)
            member = result.scalar_one_or_none()
            if member:
                member.last_read_at = msg.created_at
                await db.commit()

            # 清除 Redis 未读数
            redis = get_redis()
            await redis.hset(f"unread:{user_id}", str(conversation_id), 0)

            # 通知消息发送者（已读回执）
            await sio.emit(
                "message:status",
                {"messageId": str(message_id), "status": "read"},
                room=f"user:{msg.sender_id}",
            )

    # ------------------------------------------------------------------
    # typing:start / typing:stop
    # ------------------------------------------------------------------
    @sio.on("typing:start")
    async def handle_typing_start(sid: str, data: dict) -> None:
        session_data = await sio.get_session(sid)
        user_id = session_data["user_id"]
        conversation_id = data["conversationId"]

        await sio.emit(
            "typing:update",
            {
                "conversationId": conversation_id,
                "userId": user_id,
                "isTyping": True,
            },
            room=f"conv:{conversation_id}",
            skip_sid=sid,
        )

    @sio.on("typing:stop")
    async def handle_typing_stop(sid: str, data: dict) -> None:
        session_data = await sio.get_session(sid)
        user_id = session_data["user_id"]
        conversation_id = data["conversationId"]

        await sio.emit(
            "typing:update",
            {
                "conversationId": conversation_id,
                "userId": user_id,
                "isTyping": False,
            },
            room=f"conv:{conversation_id}",
            skip_sid=sid,
        )

    # ------------------------------------------------------------------
    # conversation:join / conversation:leave — 房间管理
    # ------------------------------------------------------------------
    @sio.on("conversation:join")
    async def handle_conversation_join(sid: str, conversation_id: str) -> None:
        """用户进入聊天页面时加入 Socket.IO 房间。"""
        session_data = await sio.get_session(sid)
        user_id = uuid.UUID(session_data["user_id"])

        # 验证是否为会话成员
        async with async_session_factory() as db:
            member_stmt = select(ConversationMember).where(
                ConversationMember.conversation_id == uuid.UUID(conversation_id),
                ConversationMember.user_id == user_id,
            )
            result = await db.execute(member_stmt)
            if result.scalar_one_or_none() is None:
                return  # 静默拒绝，不暴露会话是否存在

        sio.enter_room(sid, f"conv:{conversation_id}")

    @sio.on("conversation:leave")
    async def handle_conversation_leave(sid: str, conversation_id: str) -> None:
        """用户离开聊天页面时退出 Socket.IO 房间。"""
        sio.leave_room(sid, f"conv:{conversation_id}")

    # ------------------------------------------------------------------
    # disconnect — 在线状态广播
    # ------------------------------------------------------------------
    @sio.on("disconnect")
    async def handle_disconnect(sid: str) -> None:
        """用户断开连接，更新在线状态。"""
        session_data = await sio.get_session(sid)
        if not session_data:
            return
        user_id = session_data.get("user_id")
        if not user_id:
            return

        redis = get_redis()

        # 移除在线状态
        await redis.srem("online_users", user_id)
        last_seen = int(datetime.now(timezone.utc).timestamp() * 1000)
        await redis.hset(f"user_status:{user_id}", "last_seen", last_seen)

        # 获取用户所有会话的成员，广播离线状态
        async with async_session_factory() as db:
            conv_ids_result = await db.execute(
                select(ConversationMember.conversation_id).where(
                    ConversationMember.user_id == uuid.UUID(user_id),
                )
            )
            for (conv_id,) in conv_ids_result.all():
                await sio.emit(
                    "presence:update",
                    {
                        "userId": user_id,
                        "online": False,
                        "lastSeen": last_seen,
                    },
                    room=f"conv:{conv_id}",
                )
```

---

## 8. Redis 集成

### 8.1 Pub/Sub 跨进程广播

python-socketio 内置 Redis adapter 支持，只需在创建 AsyncServer 时指定 `client_manager`：

```python
# app/sio/server.py（已在第 2.4 节展示）
import socketio
from app.config import settings

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.cors_origins,
    client_manager=socketio.AsyncRedisManager(settings.redis_url),
)
```

**工作原理**：

- `sio.emit(event, data, room=...)` 内部通过 Redis Pub/Sub 广播到所有服务器实例
- 每个实例订阅相同的 Redis channel，收到消息后投递到本地连接的 socket
- 无需手动管理 Pub/Sub，`AsyncRedisManager` 全部封装

### 8.2 未读数缓存

```python
# app/services/unread_service.py
import uuid

from app.core.redis import get_redis


class UnreadService:
    """未读数管理（Redis Hash）。

    数据结构：HSET unread:{userId} {conversationId} {count}
    """

    @staticmethod
    async def increment(user_id: uuid.UUID, conversation_id: uuid.UUID) -> None:
        """新消息到达时递增未读数。"""
        redis = get_redis()
        await redis.hincrby(f"unread:{user_id}", str(conversation_id), 1)

    @staticmethod
    async def clear(user_id: uuid.UUID, conversation_id: uuid.UUID) -> None:
        """用户读取会话后清零。"""
        redis = get_redis()
        await redis.hset(f"unread:{user_id}", str(conversation_id), 0)

    @staticmethod
    async def get_all(user_id: uuid.UUID) -> dict[str, int]:
        """批量获取用户所有会话的未读数。"""
        redis = get_redis()
        raw = await redis.hgetall(f"unread:{user_id}")
        return {k: int(v) for k, v in raw.items()}

    @staticmethod
    async def get_one(user_id: uuid.UUID, conversation_id: uuid.UUID) -> int:
        """获取单个会话的未读数。"""
        redis = get_redis()
        val = await redis.hget(f"unread:{user_id}", str(conversation_id))
        return int(val) if val else 0
```

### 8.3 在线状态存储

```python
# app/services/presence_service.py
import uuid
from datetime import datetime, timezone

from app.core.redis import get_redis


class PresenceService:
    """在线状态管理。

    数据结构：
    - SET online_users -> 在线用户 ID 集合
    - HASH user_status:{userId} -> { last_seen: timestamp_ms }
    """

    @staticmethod
    async def set_online(user_id: uuid.UUID) -> None:
        redis = get_redis()
        await redis.sadd("online_users", str(user_id))

    @staticmethod
    async def set_offline(user_id: uuid.UUID) -> None:
        redis = get_redis()
        await redis.srem("online_users", str(user_id))
        last_seen = int(datetime.now(timezone.utc).timestamp() * 1000)
        await redis.hset(f"user_status:{user_id}", "last_seen", str(last_seen))

    @staticmethod
    async def is_online(user_id: uuid.UUID) -> bool:
        redis = get_redis()
        return await redis.sismember("online_users", str(user_id))

    @staticmethod
    async def get_online_users(user_ids: list[uuid.UUID]) -> dict[str, bool]:
        """批量查询用户在线状态。"""
        redis = get_redis()
        pipeline = redis.pipeline()
        for uid in user_ids:
            pipeline.sismember("online_users", str(uid))
        results = await pipeline.execute()
        return {str(uid): bool(online) for uid, online in zip(user_ids, results)}

    @staticmethod
    async def get_last_seen(user_id: uuid.UUID) -> int | None:
        redis = get_redis()
        val = await redis.hget(f"user_status:{user_id}", "last_seen")
        return int(val) if val else None
```

### 8.4 速率限制

```python
# app/core/rate_limit.py
from fastapi import HTTPException, Request, status

from app.core.redis import get_redis


class RateLimiter:
    """基于 Redis 的滑动窗口速率限制器。

    使用 INCR + EXPIRE 实现固定窗口（简单高效）。
    """

    def __init__(self, key_prefix: str, max_requests: int, window_seconds: int) -> None:
        self.key_prefix = key_prefix
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def check(self, identifier: str) -> None:
        """检查是否超过速率限制，超过则抛出 429。"""
        redis = get_redis()
        key = f"rate:{self.key_prefix}:{identifier}"

        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, self.window_seconds)

        if current > self.max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded: {self.max_requests} requests per {self.window_seconds}s",
            )

    async def check_sio(self, identifier: str) -> bool:
        """Socket.IO 事件的速率检查（不抛异常，返回布尔值）。"""
        redis = get_redis()
        key = f"rate:{self.key_prefix}:{identifier}"

        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, self.window_seconds)

        return current <= self.max_requests


# 预定义限制器实例（对应 im-protocol-core 安全模式 8.3 节）
message_limiter = RateLimiter("msg", max_requests=30, window_seconds=60)
typing_limiter = RateLimiter("typing", max_requests=5, window_seconds=10)
connect_limiter = RateLimiter("connect", max_requests=10, window_seconds=60)
upload_limiter = RateLimiter("upload", max_requests=10, window_seconds=60)
```

速率限制在 Socket.IO 事件中的应用示例：

```python
# 在 message:send handler 开头加入：
from app.core.rate_limit import message_limiter

@sio.on("message:send")
async def handle_message_send(sid: str, data: dict) -> dict:
    session_data = await sio.get_session(sid)
    sender_id = session_data["user_id"]

    # 速率检查
    allowed = await message_limiter.check_sio(sender_id)
    if not allowed:
        return {"success": False, "error": "Rate limit exceeded"}

    # ... 正常处理逻辑
```

---

## 9. 文件上传处理

### 9.1 图片工具

```python
# app/utils/image.py
import io
from pathlib import Path

from PIL import Image


def get_image_dimensions(content: bytes) -> tuple[int, int]:
    """从字节内容中获取图片宽高。"""
    img = Image.open(io.BytesIO(content))
    return img.size  # (width, height)


def generate_thumbnail(
    content: bytes,
    output_path: Path,
    size: tuple[int, int] = (200, 200),
) -> None:
    """生成缩略图并保存到指定路径。

    使用 LANCZOS 重采样，保持宽高比。
    """
    img = Image.open(io.BytesIO(content))

    # 转换 RGBA -> RGB（JPEG 不支持 alpha 通道）
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1])
        img = background

    img.thumbnail(size, Image.LANCZOS)
    img.save(output_path, "JPEG", quality=85, optimize=True)
```

### 9.2 S3 存储抽象

```python
# app/services/upload_service.py
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Protocol

from app.config import settings


class FileStorage(Protocol):
    """文件存储抽象协议。"""

    async def save(self, content: bytes, filename: str) -> str:
        """保存文件，返回访问 URL。"""
        ...

    async def delete(self, filename: str) -> None:
        """删除文件。"""
        ...


class LocalStorage:
    """本地文件存储（开发环境）。"""

    def __init__(self, base_dir: str = settings.upload_dir) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save(self, content: bytes, filename: str) -> str:
        file_path = self.base_dir / filename
        file_path.write_bytes(content)
        return f"/uploads/{filename}"

    async def delete(self, filename: str) -> None:
        file_path = self.base_dir / filename
        if file_path.exists():
            file_path.unlink()


class S3Storage:
    """AWS S3 文件存储（生产环境）。

    需要安装 aioboto3：pip install aioboto3
    """

    def __init__(
        self,
        bucket: str,
        region: str = "us-east-1",
        prefix: str = "uploads/",
    ) -> None:
        self.bucket = bucket
        self.region = region
        self.prefix = prefix

    async def save(self, content: bytes, filename: str) -> str:
        import aioboto3

        session = aioboto3.Session()
        async with session.client("s3", region_name=self.region) as s3:
            key = f"{self.prefix}{filename}"
            await s3.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=content,
            )
            return f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{key}"

    async def delete(self, filename: str) -> None:
        import aioboto3

        session = aioboto3.Session()
        async with session.client("s3", region_name=self.region) as s3:
            key = f"{self.prefix}{filename}"
            await s3.delete_object(Bucket=self.bucket, Key=key)


def get_storage() -> LocalStorage | S3Storage:
    """根据配置返回存储实现。"""
    if hasattr(settings, "s3_bucket") and settings.s3_bucket:
        return S3Storage(bucket=settings.s3_bucket, region=settings.s3_region)
    return LocalStorage()
```

---

## 10. 关键依赖

```toml
# pyproject.toml
[project]
name = "im-server"
version = "1.0.0"
requires-python = ">=3.11"
dependencies = [
    # Web 框架
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",

    # Socket.IO
    "python-socketio[asyncio]>=5.11.0",

    # 数据库
    "sqlalchemy[asyncio]>=2.0.35",
    "asyncpg>=0.30.0",             # PostgreSQL async 驱动
    "alembic>=1.14.0",             # 数据库迁移

    # Redis
    "redis[hiredis]>=5.2.0",       # hiredis C 扩展加速解析

    # 认证
    "python-jose[cryptography]>=3.3.0",
    "passlib[bcrypt]>=1.7.4",

    # 数据验证
    "pydantic>=2.10.0",
    "pydantic-settings>=2.6.0",

    # 文件处理
    "pillow>=11.0.0",
    "python-multipart>=0.0.18",    # FastAPI 文件上传需要

    # 工具
    "httpx>=0.28.0",               # 异步 HTTP 客户端（测试/外部调用）
]

[project.optional-dependencies]
s3 = ["aioboto3>=13.0.0"]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "httpx>=0.28.0",               # TestClient
    "ruff>=0.8.0",
    "mypy>=1.13.0",
]
```

---

## 11. 常见陷阱

### 11.1 python-socketio 特有问题

| 陷阱 | 正确做法 |
|------|---------|
| 使用 `socketio.Server` 而非 `AsyncServer` | FastAPI 是异步框架，**必须**使用 `socketio.AsyncServer(async_mode="asgi")` |
| 直接将 sio 挂载到 FastAPI（`app.mount`） | **必须**使用 `socketio.ASGIApp(sio, other_app=app)` 包装，uvicorn 入口指向这个 ASGIApp 而非 FastAPI app |
| 在 handler 中使用同步 `sio.emit`（非 async） | 所有 `emit`, `send`, `enter_room`, `leave_room` 必须 `await`，否则事件不会发出 |
| 忘记配置 `cors_allowed_origins` | python-socketio 有独立的 CORS 配置，与 FastAPI 的 CORSMiddleware **互不影响**，两处都需要配置 |
| ACK 回调返回值类型错误 | python-socketio 的 ACK 是通过 handler 的 return 值实现的（与 JS 的 callback 参数不同），return dict 即可 |
| `client_manager` 未配置导致多实例广播失败 | 多进程/多实例部署**必须**配置 `socketio.AsyncRedisManager`，否则 room 广播仅限本进程 |
| Socket.IO path 与客户端不匹配 | 默认 path 为 `/socket.io/`，客户端和服务端必须一致。`socketio.ASGIApp(socketio_path=...)` 设置路径 |

### 11.2 SQLAlchemy async session 生命周期

| 陷阱 | 正确做法 |
|------|---------|
| 在 session 关闭后访问 lazy-loaded 属性 | 设置 `expire_on_commit=False`；关键关系使用 `lazy="selectin"` 或 `lazy="joined"` 预加载 |
| Socket.IO handler 中复用 FastAPI 的 `Depends(get_session)` | Socket.IO 事件不走 FastAPI 依赖注入。**必须**在 handler 内手动创建 session：`async with async_session_factory() as db:` |
| 忘记在 Socket.IO handler 中 commit | FastAPI 路由的 `get_session` 自动 commit/rollback，但手动创建的 session 需要显式 `await db.commit()` |
| `select().unique()` 遗漏导致重复 | 使用 `selectinload` 加载一对多关系时，`result.scalars().unique().all()` 中的 `.unique()` 不可省略 |
| 大量 N+1 查询 | 会话列表等批量查询使用 `selectinload` / `joinedload` 预加载关系，避免逐条延迟加载 |

### 11.3 事件循环中的阻塞操作

| 陷阱 | 正确做法 |
|------|---------|
| 在 async handler 中同步读写文件 | 使用 `aiofiles` 或在 `asyncio.to_thread()` 中运行同步 IO |
| Pillow 图片处理阻塞事件循环 | 缩略图生成放到 `asyncio.to_thread(generate_thumbnail, ...)` 中执行 |
| bcrypt 哈希计算阻塞（~100ms） | `passlib.hash` 是 CPU 密集型，用 `asyncio.to_thread(verify_password, ...)` 包装 |
| 同步 Redis 客户端混入 async 代码 | 始终使用 `redis.asyncio.Redis`，不要混用同步 `redis.Redis` |

### 11.4 阻塞操作的正确异步化示例

```python
import asyncio
from app.core.security import verify_password as _verify_password_sync
from app.utils.image import generate_thumbnail as _generate_thumbnail_sync


async def verify_password_async(plain: str, hashed: str) -> bool:
    """在线程池中执行 bcrypt 验证，避免阻塞事件循环。"""
    return await asyncio.to_thread(_verify_password_sync, plain, hashed)


async def generate_thumbnail_async(
    content: bytes,
    output_path: str,
    size: tuple[int, int],
) -> None:
    """在线程池中生成缩略图。"""
    from pathlib import Path
    await asyncio.to_thread(_generate_thumbnail_sync, content, Path(output_path), size)
```
