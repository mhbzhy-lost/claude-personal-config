from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query

from app.deps import OptionalUserId, RequiredUserId, SessionDep, SettingsDep
from app.schemas.product import (
    ProductPage,
    ProductWithState,
    SetCartRequest,
    SetFavoriteRequest,
    UserProductState,
)
from app.services.products import ProductService

router = APIRouter(prefix="/products", tags=["Products"])

ULID_RE = r"^[0-9A-HJKMNP-TV-Z]{26}$"
Sort = Literal["price_asc", "price_desc", "sold_desc", "created_desc", "rating_desc"]


@router.get("", response_model=ProductPage)
async def list_products(
    user_id: OptionalUserId,
    session: SessionDep,
    settings: SettingsDep,
    q: Annotated[str | None, Query(max_length=200)] = None,
    category: Annotated[str | None, Query(max_length=100)] = None,
    price_min: Annotated[int | None, Query(ge=0)] = None,
    price_max: Annotated[int | None, Query(ge=0)] = None,
    in_stock_only: Annotated[bool, Query()] = False,
    sort: Annotated[Sort, Query()] = "created_desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int | None, Query(ge=1, le=100)] = None,
) -> ProductPage:
    return await ProductService(session).list_products(
        user_id=user_id,
        q=q,
        category=category,
        price_min=price_min,
        price_max=price_max,
        in_stock_only=in_stock_only,
        sort=sort,
        page=page,
        page_size=page_size or settings.default_page_size,
    )


@router.get("/{product_id}", response_model=ProductWithState)
async def get_product(
    user_id: OptionalUserId,
    session: SessionDep,
    product_id: Annotated[str, Path(pattern=ULID_RE)],
) -> ProductWithState:
    return await ProductService(session).get_product(user_id, product_id)


@router.put("/{product_id}/favorite", response_model=UserProductState)
async def set_favorite(
    user_id: RequiredUserId,
    session: SessionDep,
    product_id: Annotated[str, Path(pattern=ULID_RE)],
    body: SetFavoriteRequest,
) -> UserProductState:
    ups = await ProductService(session).set_favorite(user_id, product_id, body.is_favorite)
    await session.commit()
    return ups


@router.put("/{product_id}/cart", response_model=UserProductState)
async def set_cart(
    user_id: RequiredUserId,
    session: SessionDep,
    product_id: Annotated[str, Path(pattern=ULID_RE)],
    body: SetCartRequest,
) -> UserProductState:
    ups = await ProductService(session).set_cart_count(user_id, product_id, body.count)
    await session.commit()
    return ups
