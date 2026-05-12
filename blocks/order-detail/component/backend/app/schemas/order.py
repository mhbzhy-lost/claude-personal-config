from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

OrderStatus = Literal["pending", "paid", "shipped", "delivered", "cancelled", "refunded"]


class ShippingAddress(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipient: str = Field(max_length=100)
    phone: str = Field(max_length=30)
    country: str = Field(max_length=100)
    province: str = Field(max_length=100)
    city: str = Field(max_length=100)
    street: str = Field(max_length=500)
    postal_code: str | None = Field(default=None, max_length=30)


class OrderItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    line_no: int = Field(ge=1)
    product_id: str
    product_name: str = Field(max_length=200)
    product_image: str | None = None
    sku: str | None = None
    quantity: int = Field(ge=1)
    unit_price: int = Field(ge=0)
    line_total: int = Field(ge=0)


class OrderStatusEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: OrderStatus
    occurred_at: datetime
    note: str | None = None


class OrderSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    order_number: str
    status: OrderStatus
    currency: str
    total: int
    item_count: int = Field(ge=1)
    cover_image: str | None = None
    created_at: datetime


class OrderDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    order_number: str
    status: OrderStatus
    currency: str
    subtotal: int
    shipping: int
    total: int
    shipping_address: ShippingAddress
    items: list[OrderItem] = Field(min_length=1)
    status_events: list[OrderStatusEvent]
    paid_at: datetime | None = None
    shipped_at: datetime | None = None
    delivered_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None
    refund_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class OrderPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[OrderSummary]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    has_more: bool


class CancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = Field(default=None, max_length=500)


class RefundRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=5, max_length=500)
