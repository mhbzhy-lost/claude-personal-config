from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from app.config import Settings
from app.main import create_app
from app.models import Base

# Tables to TRUNCATE between tests. Extend as your schema grows.
# Note: "user" must be quoted (postgres reserved keyword).
TRUNCATE_TABLES = '"user", message'


@pytest.fixture(scope="session")
def settings() -> Settings:
    s = Settings()
    s.auth_mode = "dev"
    s.database_url = os.environ.get("CHAT_DATABASE_URL_TEST", s.database_url_test)
    return s


@pytest_asyncio.fixture(scope="session")
async def engine(settings: Settings) -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(settings.database_url, pool_pre_ping=True)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with engine.connect() as conn:
        trans = await conn.begin()
        s = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield s
        finally:
            await s.close()
            await trans.rollback()


@pytest_asyncio.fixture
async def client(settings: Settings, engine: AsyncEngine) -> AsyncIterator[AsyncClient]:
    app = create_app(settings)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {TRUNCATE_TABLES} RESTART IDENTITY CASCADE"))
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c
