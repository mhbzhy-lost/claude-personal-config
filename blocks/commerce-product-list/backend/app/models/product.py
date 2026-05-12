from __future__ import annotations

from sqlalchemy import CheckConstraint, Float, Index, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedMixin


class Product(Base, TimestampedMixin):
    __tablename__ = "product"
    __table_args__ = (
        CheckConstraint("price >= 0", name="price_non_negative"),
        CheckConstraint("stock >= 0", name="stock_non_negative"),
        CheckConstraint("sold_count >= 0", name="sold_count_non_negative"),
        CheckConstraint(
            "rating IS NULL OR (rating >= 0 AND rating <= 5)",
            name="rating_range",
        ),
        # Sort indices — one per server-supported sort axis.
        Index("ix_product_created_at", "created_at"),
        Index("ix_product_price", "price"),
        Index("ix_product_sold_count", "sold_count"),
        Index("ix_product_rating", "rating"),
        Index("ix_product_category", "category"),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000))
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CNY")
    original_price: Mapped[int | None] = mapped_column(Integer)
    cover_image: Mapped[str] = mapped_column(String(2048), nullable=False)
    images: Mapped[list[str]] = mapped_column(ARRAY(String(2048)), default=list, nullable=False)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sold_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rating: Mapped[float | None] = mapped_column(Float)
    rating_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(50)), default=list, nullable=False)
