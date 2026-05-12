from __future__ import annotations

import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone

from faker import Faker
from sqlalchemy import delete

from app.config import get_settings
from app.db import Database
from app.models import Product, User, UserProductState
from app.ulid_utils import new_ulid

faker = Faker()

CATEGORIES = [
    "clothing/men",
    "clothing/women",
    "electronics/phones",
    "electronics/laptops",
    "home/furniture",
    "home/decor",
    "food/snacks",
    "beauty/skincare",
    "sports/outdoor",
    "books/fiction",
]


async def reset(db: Database) -> None:
    async with db.session() as s:
        for m in (UserProductState, Product, User):
            await s.execute(delete(m))
        await s.commit()


async def seed(
    db: Database,
    *,
    product_count: int,
    favorite_ratio: float = 0.1,
    cart_ratio: float = 0.05,
    primary_user_id: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    async with db.session() as s:
        primary_id = primary_user_id or new_ulid()
        s.add(User(id=primary_id, name="Demo User", created_at=now, updated_at=now))
        await s.flush()

        products: list[Product] = []
        for _ in range(product_count):
            price = random.randint(100, 99900)  # 1 yuan to 999 yuan
            has_sale = random.random() < 0.3
            stock = random.choice([0, *range(1, 50), *range(50, 500)])
            rating_count = random.randint(0, 5000)
            products.append(
                Product(
                    id=new_ulid(),
                    name=faker.catch_phrase(),
                    description=faker.sentence(nb_words=random.randint(8, 20)),
                    price=price,
                    currency="CNY",
                    original_price=int(price * random.uniform(1.1, 1.5)) if has_sale else None,
                    cover_image=f"https://picsum.photos/seed/{faker.uuid4()}/300/300",
                    images=[
                        f"https://picsum.photos/seed/{faker.uuid4()}/600/600"
                        for _ in range(random.randint(1, 5))
                    ],
                    stock=stock,
                    sold_count=random.randint(0, 100000),
                    rating=round(random.uniform(3.0, 5.0), 1) if rating_count > 0 else None,
                    rating_count=rating_count,
                    category=random.choice(CATEGORIES),
                    tags=random.sample(
                        ["新品", "热销", "包邮", "限时", "正品", "促销", "推荐"],
                        k=random.randint(0, 3),
                    ),
                    created_at=now - timedelta(days=random.randint(0, 365)),
                    updated_at=now,
                )
            )
        s.add_all(products)
        await s.flush()

        states = []
        for prod in products:
            is_fav = random.random() < favorite_ratio
            cart_count = random.randint(1, 3) if random.random() < cart_ratio else 0
            if is_fav or cart_count > 0:
                states.append(
                    UserProductState(
                        user_id=primary_id,
                        product_id=prod.id,
                        is_favorite=is_fav,
                        cart_count=min(cart_count, prod.stock),
                        favorited_at=now if is_fav else None,
                    )
                )
        s.add_all(states)
        await s.commit()
    return primary_id


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cpl-seed")
    parser.add_argument("mode", choices=["demo", "bench", "reset"])
    parser.add_argument("--primary-user-id", default=None)
    args = parser.parse_args(argv)

    settings = get_settings()
    db = Database(settings.database_url)

    async def run() -> str | None:
        if args.mode == "reset":
            await reset(db)
            await db.dispose()
            return None
        count = 100 if args.mode == "demo" else 1000
        uid = await seed(db, product_count=count, primary_user_id=args.primary_user_id)
        await db.dispose()
        return uid

    uid = asyncio.run(run())
    if uid:
        print(f"Seeded {args.mode}. Primary user_id = {uid}")
        print(f"Use header: X-Dev-User-Id: {uid}")
    else:
        print("Reset complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
