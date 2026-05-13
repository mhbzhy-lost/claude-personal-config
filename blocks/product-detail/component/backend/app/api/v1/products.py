"""
Stub product detail endpoints — returns canned mock data so the block can be
booted as-is for shape verification. Real domain implementation (models /
migrations / persistence) is the host's responsibility after copying this
block (see component/frontend/SKILL.md "完整业务由 host 扩展").
"""
from __future__ import annotations

from fastapi import APIRouter

from app.errors import not_found

router = APIRouter(tags=["Products"])


# Canned mock dataset — covers the "shape" exposed to the frontend.
_MOCK: dict[str, dict] = {
    "01JBPRODDEMO001": {
        "id": "01JBPRODDEMO001",
        "title": "Sony A7M4 全画幅微单(35mm 套机)",
        "subtitle": "全画幅 / 3300 万像素 / 5 轴防抖",
        "description": "Sony 全画幅微单 Alpha 7 IV,搭载新一代 33MP 全画幅 Exmor R CMOS 影像传感器与 BIONZ XR 影像处理器。",
        "media": [
            {"id": "m1", "kind": "image", "url": "https://picsum.photos/seed/cam1/1200/800",
             "thumb": "https://picsum.photos/seed/cam1/240/240", "alt": "正面"},
            {"id": "m2", "kind": "image", "url": "https://picsum.photos/seed/cam2/1200/800",
             "thumb": "https://picsum.photos/seed/cam2/240/240", "alt": "顶视图"},
            {"id": "m3", "kind": "image", "url": "https://picsum.photos/seed/cam3/1200/800",
             "thumb": "https://picsum.photos/seed/cam3/240/240", "alt": "拍摄样张"},
        ],
        "skus": [
            {"id": "sku-body", "label": "单机身", "price": 17999, "stock": 5},
            {"id": "sku-2870", "label": "+ 28-70mm 套头", "price": 19999, "stock": 2},
            {"id": "sku-2470", "label": "+ 24-70mm F2.8 GM", "price": 33999, "stock": 0},
        ],
        "reviews": [
            {"id": "r1", "rating": 5, "author": "影像爱好者", "body": "对焦快,画质好,夜景表现出色。",
             "created_at": "2026-04-22T10:21:00Z"},
            {"id": "r2", "rating": 4, "author": "新手摄影", "body": "学习曲线略陡,但拍出来很满意。",
             "created_at": "2026-04-25T15:08:00Z"},
        ],
        "rating": 4.6,
        "rating_count": 248,
        "currency": "CNY",
    },
}


@router.get("/products/{product_id}")
async def get_product_detail(product_id: str) -> dict:
    item = _MOCK.get(product_id)
    if not item:
        raise not_found("product.not_found")
    return item


@router.get("/products")
async def list_products() -> dict:
    return {"items": list(_MOCK.values())}
