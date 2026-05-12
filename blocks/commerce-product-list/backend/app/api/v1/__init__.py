from fastapi import APIRouter

from app.api.v1 import me, products

router = APIRouter(prefix="/v1")
router.include_router(products.router)
router.include_router(me.router)
