from fastapi import APIRouter

from app.api.v1 import me, messages, peers, ws

router = APIRouter(prefix="/v1")
router.include_router(me.router)
router.include_router(peers.router)
router.include_router(messages.router)
router.include_router(ws.router)
