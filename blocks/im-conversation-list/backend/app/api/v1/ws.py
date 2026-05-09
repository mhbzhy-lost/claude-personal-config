from __future__ import annotations

import structlog
from fastapi import APIRouter, Header, Query, WebSocket, WebSocketDisconnect, status
from fastapi.security.utils import get_authorization_scheme_param

from app.auth import AuthBackend
from app.ulid_utils import is_ulid

router = APIRouter()
logger = structlog.get_logger(__name__)


@router.websocket("/ws")
async def ws_endpoint(
    websocket: WebSocket,
    authorization: str | None = Header(default=None),
    x_dev_user_id: str | None = Header(default=None),
    token: str | None = Query(default=None),
    dev_user_id: str | None = Query(default=None),
) -> None:
    auth: AuthBackend = websocket.app.state.auth_backend
    hub = websocket.app.state.ws_hub

    bearer = None
    if authorization:
        scheme, param = get_authorization_scheme_param(authorization)
        if scheme.lower() == "bearer" and param:
            bearer = _make_credentials(param)
    elif token:
        bearer = _make_credentials(token)

    dev_uid = x_dev_user_id or dev_user_id

    try:
        user_id = await auth.authenticate(bearer, dev_uid)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if not is_ulid(user_id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    await hub.register(user_id, websocket)
    try:
        while True:
            msg = await websocket.receive_json()
            event_type = msg.get("type")
            if event_type == "read.ack":
                logger.debug("ws.read_ack", user_id=user_id, payload=msg)
            else:
                logger.debug("ws.unknown_event", user_id=user_id, type=event_type)
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unregister(user_id, websocket)


def _make_credentials(token: str):  # noqa: ANN202
    from fastapi.security import HTTPAuthorizationCredentials
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
