from fastapi import APIRouter

from app.api.v1 import conversations, me, messages, ws

router = APIRouter(prefix="/v1")
router.include_router(conversations.router)
router.include_router(messages.router)
router.include_router(me.router)
router.include_router(ws.router)
