from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException

from app.api.v1 import router as v1_router
from app.auth import make_auth_backend
from app.config import Settings, get_settings
from app.db import make_database
from app.errors import (
    ProblemException,
    http_exception_handler,
    problem_exception_handler,
    validation_exception_handler,
)

logger = structlog.get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings
        app.state.database = make_database(settings)
        app.state.auth_backend = make_auth_backend(settings)
        logger.info("app.start", auth_mode=settings.auth_mode)
        try:
            yield
        finally:
            await app.state.database.dispose()
            logger.info("app.stop")

    app = FastAPI(title="commerce-product-list", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_exception_handler(ProblemException, problem_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    app.include_router(v1_router)

    @app.get("/healthz", tags=["Meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
