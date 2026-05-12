from fastapi import APIRouter

from app.api.v1 import me

router = APIRouter(prefix="/v1")
router.include_router(me.router)

# Add your domain routers here:
# from app.api.v1 import <entity>
# router.include_router(<entity>.router)
