from fastapi import APIRouter

from app.api.v1 import me, profiles

router = APIRouter(prefix="/v1")
router.include_router(me.router)
router.include_router(profiles.router)

# Add your domain routers here:
# from app.api.v1 import <entity>
# router.include_router(<entity>.router)
