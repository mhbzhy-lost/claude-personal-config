from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.deps import RequiredUserId, SessionDep
from app.schemas.order import (
    CancelRequest,
    OrderDetail,
    OrderPage,
    OrderStatus,
    RefundRequest,
)
from app.services.orders import OrderService

router = APIRouter(prefix="/orders", tags=["Orders"])

ULID_RE = r"^[0-9A-HJKMNP-TV-Z]{26}$"


@router.get("", response_model=OrderPage)
async def list_orders(
    user_id: RequiredUserId,
    session: SessionDep,
    status: Annotated[OrderStatus | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> OrderPage:
    return await OrderService(session).list_for_user(
        user_id, status=status, page=page, page_size=page_size
    )


@router.get("/{order_id}", response_model=OrderDetail)
async def get_order(
    user_id: RequiredUserId,
    session: SessionDep,
    order_id: Annotated[str, Path(pattern=ULID_RE)],
) -> OrderDetail:
    return await OrderService(session).get_for_user(user_id, order_id)


@router.post("/{order_id}/cancel", response_model=OrderDetail)
async def cancel_order(
    user_id: RequiredUserId,
    session: SessionDep,
    order_id: Annotated[str, Path(pattern=ULID_RE)],
    body: CancelRequest = CancelRequest(),
) -> OrderDetail:
    result = await OrderService(session).cancel(user_id, order_id, body.reason)
    await session.commit()
    return result


@router.post("/{order_id}/refund", response_model=OrderDetail)
async def request_refund(
    user_id: RequiredUserId,
    session: SessionDep,
    order_id: Annotated[str, Path(pattern=ULID_RE)],
    body: RefundRequest,
) -> OrderDetail:
    result = await OrderService(session).request_refund(user_id, order_id, body.reason)
    await session.commit()
    return result
