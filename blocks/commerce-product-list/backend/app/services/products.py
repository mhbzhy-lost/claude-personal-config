from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import not_found, unprocessable
from app.models import Product as ProductModel
from app.models import UserProductState as UPSModel
from app.schemas.product import (
    Product as ProductSchema,
    ProductPage,
    ProductWithState,
    UserProductState as UPSSchema,
)

Sort = Literal["price_asc", "price_desc", "sold_desc", "created_desc", "rating_desc"]


class ProductService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_products(
        self,
        *,
        user_id: str | None,
        q: str | None,
        category: str | None,
        price_min: int | None,
        price_max: int | None,
        in_stock_only: bool,
        sort: Sort,
        page: int,
        page_size: int,
    ) -> ProductPage:
        p = ProductModel
        filters = []
        if q:
            like = f"%{q.lower()}%"
            filters.append(or_(func.lower(p.name).like(like), func.lower(p.description).like(like)))
        if category:
            filters.append(p.category == category)
        if price_min is not None:
            filters.append(p.price >= price_min)
        if price_max is not None:
            filters.append(p.price <= price_max)
        if in_stock_only:
            filters.append(p.stock > 0)

        order_by = {
            "price_asc": (p.price.asc(), p.id.asc()),
            "price_desc": (p.price.desc(), p.id.desc()),
            "sold_desc": (p.sold_count.desc(), p.id.desc()),
            "created_desc": (p.created_at.desc(), p.id.desc()),
            "rating_desc": (p.rating.desc().nulls_last(), p.id.desc()),
        }[sort]

        count_stmt = select(func.count()).select_from(p)
        if filters:
            count_stmt = count_stmt.where(and_(*filters))
        total = (await self._session.execute(count_stmt)).scalar_one()

        list_stmt = select(p)
        if filters:
            list_stmt = list_stmt.where(and_(*filters))
        list_stmt = list_stmt.order_by(*order_by).limit(page_size).offset((page - 1) * page_size)
        rows = (await self._session.execute(list_stmt)).scalars().all()

        states: dict[str, UPSSchema] = {}
        if user_id and rows:
            state_stmt = select(UPSModel).where(
                UPSModel.user_id == user_id,
                UPSModel.product_id.in_([r.id for r in rows]),
            )
            for ups in (await self._session.execute(state_stmt)).scalars().all():
                states[ups.product_id] = UPSSchema(
                    product_id=ups.product_id,
                    user_id=ups.user_id,
                    is_favorite=ups.is_favorite,
                    cart_count=ups.cart_count,
                    favorited_at=ups.favorited_at,
                    updated_at=ups.updated_at,
                )

        items = [
            ProductWithState(
                **ProductSchema.model_validate(r, from_attributes=True).model_dump(),
                user_state=states.get(r.id),
            )
            for r in rows
        ]
        has_more = page * page_size < total
        return ProductPage(items=items, total=total, page=page, page_size=page_size, has_more=has_more)

    async def get_product(self, user_id: str | None, product_id: str) -> ProductWithState:
        stmt = select(ProductModel).where(ProductModel.id == product_id)
        prod = (await self._session.execute(stmt)).scalar_one_or_none()
        if prod is None:
            raise not_found("product.not_found")
        state: UPSSchema | None = None
        if user_id:
            s_stmt = select(UPSModel).where(
                UPSModel.user_id == user_id, UPSModel.product_id == product_id
            )
            ups = (await self._session.execute(s_stmt)).scalar_one_or_none()
            if ups is not None:
                state = UPSSchema(
                    product_id=ups.product_id,
                    user_id=ups.user_id,
                    is_favorite=ups.is_favorite,
                    cart_count=ups.cart_count,
                    favorited_at=ups.favorited_at,
                    updated_at=ups.updated_at,
                )
        return ProductWithState(
            **ProductSchema.model_validate(prod, from_attributes=True).model_dump(),
            user_state=state,
        )

    async def set_favorite(
        self, user_id: str, product_id: str, is_favorite: bool
    ) -> UPSSchema:
        prod = await self._session.get(ProductModel, product_id)
        if prod is None:
            raise not_found("product.not_found")
        ups = await self._get_or_create_state(user_id, product_id)
        ups.is_favorite = is_favorite
        ups.favorited_at = datetime.now(timezone.utc) if is_favorite else None
        await self._session.flush()
        return self._state_to_schema(ups)

    async def set_cart_count(
        self, user_id: str, product_id: str, count: int
    ) -> UPSSchema:
        prod = await self._session.get(ProductModel, product_id)
        if prod is None:
            raise not_found("product.not_found")
        if count > prod.stock:
            raise unprocessable(
                "cart.stock_insufficient",
                f"Requested {count}, stock {prod.stock}.",
            )
        ups = await self._get_or_create_state(user_id, product_id)
        ups.cart_count = count
        await self._session.flush()
        return self._state_to_schema(ups)

    async def _get_or_create_state(self, user_id: str, product_id: str) -> UPSModel:
        stmt = select(UPSModel).where(
            UPSModel.user_id == user_id, UPSModel.product_id == product_id
        )
        ups = (await self._session.execute(stmt)).scalar_one_or_none()
        if ups is None:
            ups = UPSModel(user_id=user_id, product_id=product_id)
            self._session.add(ups)
            await self._session.flush()
        return ups

    @staticmethod
    def _state_to_schema(ups: UPSModel) -> UPSSchema:
        return UPSSchema(
            product_id=ups.product_id,
            user_id=ups.user_id,
            is_favorite=ups.is_favorite,
            cart_count=ups.cart_count,
            favorited_at=ups.favorited_at,
            updated_at=ups.updated_at,
        )
