from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import Product, User
from app.ulid_utils import new_ulid


async def make_user(s: AsyncSession, name: str = "Test User") -> str:
    now = datetime.now(timezone.utc)
    uid = new_ulid()
    s.add(User(id=uid, name=name, created_at=now, updated_at=now))
    await s.flush()
    return uid


async def make_product(
    s: AsyncSession,
    *,
    name: str = "Test Product",
    price: int = 9900,
    stock: int = 10,
    sold_count: int = 100,
    rating: float | None = 4.5,
    category: str = "electronics/phones",
    created_offset_days: int = 0,
) -> str:
    now = datetime.now(timezone.utc)
    pid = new_ulid()
    s.add(
        Product(
            id=pid,
            name=name,
            price=price,
            currency="CNY",
            cover_image="https://example.com/img.jpg",
            images=[],
            stock=stock,
            sold_count=sold_count,
            rating=rating,
            rating_count=100 if rating else 0,
            category=category,
            tags=[],
            created_at=now - timedelta(days=created_offset_days),
            updated_at=now,
        )
    )
    await s.flush()
    return pid


async def seed_user_and_products(engine: AsyncEngine, n: int = 5) -> tuple[str, list[str]]:
    async with AsyncSession(bind=engine, expire_on_commit=False) as s:
        uid = await make_user(s)
        pids = []
        for i in range(n):
            pids.append(await make_product(s, name=f"P-{i}", price=1000 + i * 1000,
                                            sold_count=i * 100, created_offset_days=i))
        await s.commit()
    return uid, pids
