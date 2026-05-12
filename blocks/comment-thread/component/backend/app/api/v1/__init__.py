from fastapi import APIRouter

from app.api.v1 import comments, me

router = APIRouter(prefix="/v1")
router.include_router(me.router)
router.include_router(comments.router)
