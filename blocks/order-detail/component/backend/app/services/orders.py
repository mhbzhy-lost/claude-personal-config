from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import not_found, unprocessable
from app.models import Order as OrderModel
from app.models import OrderItem as OrderItemModel
from app.models import OrderStatusEvent as OrderEventModel
from app.schemas.order import (
    OrderDetail,
    OrderItem as OrderItemSchema,
    OrderPage,
    OrderStatus,
    OrderStatusEvent as OrderEventSchema,
    OrderSummary,
    ShippingAddress,
)
from app.ulid_utils import new_ulid


class OrderService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_user(
        self,
        user_id: str,
        *,
        status: OrderStatus | None,
        page: int,
        page_size: int,
    ) -> OrderPage:
        o = OrderModel
        filters = [o.user_id == user_id]
        if status:
            filters.append(o.status == status)

        count_stmt = select(func.count()).select_from(o).where(*filters)
        total = (await self._session.execute(count_stmt)).scalar_one()

        list_stmt = (
            select(o)
            .where(*filters)
            .order_by(o.created_at.desc(), o.id.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        orders = (await self._session.execute(list_stmt)).scalars().all()

        item_count_by_order: dict[str, int] = {}
        cover_by_order: dict[str, str | None] = {}
        if orders:
            cnt_stmt = (
                select(
                    OrderItemModel.order_id,
                    func.count().label("cnt"),
                    func.min(OrderItemModel.line_no).label("min_line"),
                )
                .where(OrderItemModel.order_id.in_([o_.id for o_ in orders]))
                .group_by(OrderItemModel.order_id)
            )
            for oid, cnt, _ in (await self._session.execute(cnt_stmt)).all():
                item_count_by_order[oid] = cnt
            cover_stmt = select(
                OrderItemModel.order_id, OrderItemModel.product_image
            ).where(
                OrderItemModel.order_id.in_([o_.id for o_ in orders]),
                OrderItemModel.line_no == 1,
            )
            for oid, img in (await self._session.execute(cover_stmt)).all():
                cover_by_order[oid] = img

        items = [
            OrderSummary(
                id=o_.id,
                order_number=o_.order_number,
                status=o_.status,
                currency=o_.currency,
                total=o_.total,
                item_count=item_count_by_order.get(o_.id, 1),
                cover_image=cover_by_order.get(o_.id),
                created_at=o_.created_at,
            )
            for o_ in orders
        ]
        has_more = page * page_size < total
        return OrderPage(items=items, total=total, page=page, page_size=page_size, has_more=has_more)

    async def get_for_user(self, user_id: str, order_id: str) -> OrderDetail:
        order = await self._load_order(user_id, order_id)
        items = await self._load_items(order_id)
        events = await self._load_events(order_id)
        return self._compose_detail(order, items, events)

    async def cancel(self, user_id: str, order_id: str, reason: str | None) -> OrderDetail:
        order = await self._load_order(user_id, order_id)
        if order.status != "pending":
            raise unprocessable(
                "order.cannot_cancel",
                f"Order in {order.status!r} status cannot be cancelled.",
            )
        now = datetime.now(timezone.utc)
        order.status = "cancelled"
        order.cancelled_at = now
        order.cancel_reason = reason
        self._session.add(
            OrderEventModel(
                id=new_ulid(),
                order_id=order_id,
                status="cancelled",
                occurred_at=now,
                note=reason,
            )
        )
        await self._session.flush()
        return await self.get_for_user(user_id, order_id)

    async def request_refund(
        self, user_id: str, order_id: str, reason: str
    ) -> OrderDetail:
        order = await self._load_order(user_id, order_id)
        if order.status not in {"paid", "shipped", "delivered"}:
            raise unprocessable(
                "order.cannot_refund",
                f"Order in {order.status!r} status is not eligible for refund.",
            )
        now = datetime.now(timezone.utc)
        order.status = "refunded"
        order.refund_reason = reason
        self._session.add(
            OrderEventModel(
                id=new_ulid(),
                order_id=order_id,
                status="refunded",
                occurred_at=now,
                note=reason,
            )
        )
        await self._session.flush()
        return await self.get_for_user(user_id, order_id)

    async def _load_order(self, user_id: str, order_id: str) -> OrderModel:
        stmt = select(OrderModel).where(
            OrderModel.id == order_id, OrderModel.user_id == user_id
        )
        order = (await self._session.execute(stmt)).scalar_one_or_none()
        if order is None:
            raise not_found("order.not_found")
        return order

    async def _load_items(self, order_id: str) -> list[OrderItemSchema]:
        stmt = (
            select(OrderItemModel)
            .where(OrderItemModel.order_id == order_id)
            .order_by(OrderItemModel.line_no)
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [
            OrderItemSchema(
                line_no=r.line_no,
                product_id=r.product_id,
                product_name=r.product_name,
                product_image=r.product_image,
                sku=r.sku,
                quantity=r.quantity,
                unit_price=r.unit_price,
                line_total=r.line_total,
            )
            for r in rows
        ]

    async def _load_events(self, order_id: str) -> list[OrderEventSchema]:
        stmt = (
            select(OrderEventModel)
            .where(OrderEventModel.order_id == order_id)
            .order_by(OrderEventModel.occurred_at)
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [
            OrderEventSchema(status=r.status, occurred_at=r.occurred_at, note=r.note)
            for r in rows
        ]

    @staticmethod
    def _compose_detail(
        order: OrderModel,
        items: list[OrderItemSchema],
        events: list[OrderEventSchema],
    ) -> OrderDetail:
        return OrderDetail(
            id=order.id,
            order_number=order.order_number,
            status=order.status,
            currency=order.currency,
            subtotal=order.subtotal,
            shipping=order.shipping,
            total=order.total,
            shipping_address=ShippingAddress(**order.shipping_address),
            items=items,
            status_events=events,
            paid_at=order.paid_at,
            shipped_at=order.shipped_at,
            delivered_at=order.delivered_at,
            cancelled_at=order.cancelled_at,
            cancel_reason=order.cancel_reason,
            refund_reason=order.refund_reason,
            created_at=order.created_at,
            updated_at=order.updated_at,
        )
