from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserProductState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: str
    user_id: str
    is_favorite: bool
    cart_count: int = Field(ge=0)
    favorited_at: datetime | None = None
    updated_at: datetime


class Product(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    price: int = Field(ge=0, description="In cents")
    currency: str = Field(min_length=3, max_length=3)
    original_price: int | None = Field(default=None, ge=0)
    cover_image: str
    images: list[str] = Field(default_factory=list, max_length=9)
    stock: int = Field(ge=0)
    sold_count: int = Field(ge=0)
    rating: float | None = Field(default=None, ge=0, le=5)
    rating_count: int = Field(ge=0)
    category: str = Field(max_length=100)
    tags: list[str] = Field(default_factory=list, max_length=10)
    created_at: datetime
    updated_at: datetime


class ProductWithState(Product):
    user_state: UserProductState | None = None


class ProductPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ProductWithState]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    has_more: bool


class SetFavoriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_favorite: bool


class SetCartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    count: int = Field(ge=0)
