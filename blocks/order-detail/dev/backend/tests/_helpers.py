from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order, OrderItem, OrderStatusEvent, User
from app.ulid_utils import new_ulid


async def make_user(s: AsyncSession, name: str = "Test User") -> str:
    now = datetime.now(timezone.utc)
    uid = new_ulid()
    s.add(User(id=uid, name=name, created_at=now, updated_at=now))
    await s.flush()
    return uid


def _addr() -> dict:
    return {
        "recipient": "Alice",
        "phone": "13800000000",
        "country": "China",
        "province": "Beijing",
        "city": "Beijing",
        "street": "1 Main Rd",
    }


async def make_order(
    s: AsyncSession,
    *,
    user_id: str,
    status: str = "pending",
    line_count: int = 1,
    age_days: int = 0,
) -> str:
    now = datetime.now(timezone.utc)
    created = now - timedelta(days=age_days)
    oid = new_ulid()
    subtotal = 0
    items: list[OrderItem] = []
    for line_no in range(1, line_count + 1):
        qty = 1
        price = 9900 + line_no * 100
        items.append(
            OrderItem(
                order_id=oid, line_no=line_no, product_id=new_ulid(),
                product_name=f"Item {line_no}", product_image=None, sku=None,
                quantity=qty, unit_price=price, line_total=price * qty,
            )
        )
        subtotal += price * qty
    paid = status in {"paid", "shipped", "delivered", "refunded"}
    shipped = status in {"shipped", "delivered", "refunded"}
    delivered = status in {"delivered", "refunded"}
    s.add(
        Order(
            id=oid,
            user_id=user_id,
            order_number=f"OD{created.strftime('%Y%m%d')}{oid[-10:]}",
            status=status,
            currency="CNY",
            subtotal=subtotal,
            shipping=500,
            total=subtotal + 500,
            shipping_address=_addr(),
            paid_at=created + timedelta(minutes=5) if paid else None,
            shipped_at=created + timedelta(hours=2) if shipped else None,
            delivered_at=created + timedelta(days=2) if delivered else None,
            created_at=created,
            updated_at=now,
        )
    )
    await s.flush()
    s.add_all(items)
    s.add(
        OrderStatusEvent(
            id=new_ulid(), order_id=oid, status="pending",
            occurred_at=created, note=None,
        )
    )
    await s.flush()
    return oid
