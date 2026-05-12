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
from app.models import Order, OrderItem, OrderStatusEvent, User
from app.ulid_utils import new_ulid

faker = Faker()


async def reset(db: Database) -> None:
    async with db.session() as s:
        for m in (OrderStatusEvent, OrderItem, Order, User):
            await s.execute(delete(m))
        await s.commit()


def _make_address() -> dict:
    return {
        "recipient": faker.name(),
        "phone": faker.phone_number(),
        "country": "China",
        "province": faker.state(),
        "city": faker.city(),
        "street": faker.street_address(),
        "postal_code": faker.zipcode(),
    }


STATUS_FLOW = ["pending", "paid", "shipped", "delivered"]


async def seed_demo(db: Database, primary_user_id: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    async with db.session() as s:
        primary_id = primary_user_id or new_ulid()
        s.add(User(id=primary_id, name="Demo User", created_at=now, updated_at=now))
        await s.flush()

        orders: list[Order] = []
        items: list[OrderItem] = []
        events: list[OrderStatusEvent] = []
        for i in range(20):
            order_id = new_ulid()
            target_status = random.choices(
                ["pending", "paid", "shipped", "delivered", "cancelled", "refunded"],
                weights=[3, 3, 3, 4, 1, 1],
            )[0]
            created_at = now - timedelta(days=random.randint(0, 60))
            line_count = random.randint(1, 4)
            subtotal = 0
            for line_no in range(1, line_count + 1):
                qty = random.randint(1, 3)
                price = random.randint(2000, 49900)
                items.append(
                    OrderItem(
                        order_id=order_id,
                        line_no=line_no,
                        product_id=new_ulid(),
                        product_name=faker.catch_phrase(),
                        product_image=f"https://picsum.photos/seed/{faker.uuid4()}/200/200",
                        sku=faker.bothify("SKU-####-??").upper(),
                        quantity=qty,
                        unit_price=price,
                        line_total=price * qty,
                    )
                )
                subtotal += price * qty
            shipping_fee = random.choice([0, 0, 800, 1500])
            paid_at = shipped_at = delivered_at = cancelled_at = None
            cancel_reason = refund_reason = None

            if target_status in ("paid", "shipped", "delivered", "refunded"):
                paid_at = created_at + timedelta(minutes=random.randint(5, 120))
            if target_status in ("shipped", "delivered", "refunded"):
                shipped_at = paid_at + timedelta(hours=random.randint(2, 48))
            if target_status in ("delivered", "refunded"):
                delivered_at = shipped_at + timedelta(days=random.randint(1, 5))
            if target_status == "cancelled":
                cancelled_at = created_at + timedelta(minutes=random.randint(1, 60))
                cancel_reason = random.choice(["改主意", "下错单", "想换其他"])
            if target_status == "refunded":
                refund_reason = random.choice(["质量问题", "尺码不合", "色差太大"])

            orders.append(
                Order(
                    id=order_id,
                    user_id=primary_id,
                    order_number=f"OD{created_at.strftime('%Y%m%d')}{random.randint(10000, 99999)}",
                    status=target_status,
                    currency="CNY",
                    subtotal=subtotal,
                    shipping=shipping_fee,
                    total=subtotal + shipping_fee,
                    shipping_address=_make_address(),
                    paid_at=paid_at,
                    shipped_at=shipped_at,
                    delivered_at=delivered_at,
                    cancelled_at=cancelled_at,
                    cancel_reason=cancel_reason,
                    refund_reason=refund_reason,
                    created_at=created_at,
                    updated_at=now,
                )
            )

            # Status event timeline
            ts = created_at
            events.append(
                OrderStatusEvent(
                    id=new_ulid(), order_id=order_id, status="pending",
                    occurred_at=ts, note=None,
                )
            )
            for st in ("paid", "shipped", "delivered"):
                if st == "paid" and paid_at:
                    events.append(OrderStatusEvent(
                        id=new_ulid(), order_id=order_id, status="paid",
                        occurred_at=paid_at, note=None,
                    ))
                elif st == "shipped" and shipped_at:
                    events.append(OrderStatusEvent(
                        id=new_ulid(), order_id=order_id, status="shipped",
                        occurred_at=shipped_at, note=None,
                    ))
                elif st == "delivered" and delivered_at:
                    events.append(OrderStatusEvent(
                        id=new_ulid(), order_id=order_id, status="delivered",
                        occurred_at=delivered_at, note=None,
                    ))
            if target_status == "cancelled":
                events.append(OrderStatusEvent(
                    id=new_ulid(), order_id=order_id, status="cancelled",
                    occurred_at=cancelled_at, note=cancel_reason,
                ))
            if target_status == "refunded":
                events.append(OrderStatusEvent(
                    id=new_ulid(), order_id=order_id, status="refunded",
                    occurred_at=delivered_at + timedelta(days=random.randint(1, 7)),
                    note=refund_reason,
                ))

        s.add_all(orders)
        await s.flush()
        s.add_all(items)
        s.add_all(events)
        await s.commit()
    return primary_id


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="od-seed")
    parser.add_argument("mode", choices=["demo", "reset"])
    parser.add_argument("--primary-user-id", default=None)
    args = parser.parse_args(argv)

    settings = get_settings()
    db = Database(settings.database_url)

    async def run() -> str | None:
        if args.mode == "reset":
            await reset(db)
            await db.dispose()
            return None
        uid = await seed_demo(db, primary_user_id=args.primary_user_id)
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
