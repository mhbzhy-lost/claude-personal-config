---
name: fastapi-websocket
description: "WebSocket 端点定义、连接生命周期管理、多客户端广播、ConnectionManager 模式、WebSocket 认证与依赖注入"
tech_stack: [fastapi, backend]
language: [python]
capability: [websocket]
---

# FastAPI WebSocket -- 实时双向通信

> 来源：https://fastapi.tiangolo.com/advanced/websockets/ / https://fastapi.tiangolo.com/advanced/testing-websockets/
> 版本基准：FastAPI 0.115+（Python 3.10+）

## 用途

通过 WebSocket 协议实现服务端与客户端的双向实时通信，适用于聊天、实时通知、数据流推送等场景。

## 何时使用

- 需要服务端主动推送数据到客户端（实时通知、股票行情）
- 需要低延迟双向通信（聊天室、协作编辑）
- 需要持久连接而非反复轮询
- 对比 SSE：WebSocket 支持双向通信，SSE 仅支持服务端到客户端单向推送

## 基础 WebSocket 端点

```python
from fastapi import FastAPI, WebSocket
from fastapi.responses import HTMLResponse

app = FastAPI()

html = """
<!DOCTYPE html>
<html>
<head><title>WebSocket Echo</title></head>
<body>
    <h1>WebSocket Echo</h1>
    <form action="" onsubmit="sendMessage(event)">
        <input type="text" id="messageText" autocomplete="off"/>
        <button>Send</button>
    </form>
    <ul id="messages"></ul>
    <script>
        var ws = new WebSocket("ws://localhost:8000/ws");
        ws.onmessage = function(event) {
            var messages = document.getElementById("messages");
            var message = document.createElement("li");
            message.textContent = event.data;
            messages.appendChild(message);
        };
        function sendMessage(event) {
            var input = document.getElementById("messageText");
            ws.send(input.value);
            input.value = "";
            event.preventDefault();
        }
    </script>
</body>
</html>
"""

@app.get("/")
async def get():
    return HTMLResponse(html)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        await websocket.send_text(f"Echo: {data}")
```

## WebSocket API 方法

```python
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 接受连接
    await websocket.accept()

    # 接收数据
    text = await websocket.receive_text()        # 文本消息
    data = await websocket.receive_bytes()       # 二进制消息
    json_data = await websocket.receive_json()   # JSON 消息

    # 发送数据
    await websocket.send_text("hello")           # 文本消息
    await websocket.send_bytes(b"\x00\x01")      # 二进制消息
    await websocket.send_json({"key": "value"})  # JSON 消息

    # 关闭连接
    await websocket.close(code=1000, reason="Normal closure")
```

## 连接管理器模式（多客户端广播）

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: int):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # 发送个人确认
            await manager.send_personal_message(f"You wrote: {data}", websocket)
            # 广播给所有连接的客户端
            await manager.broadcast(f"Client #{client_id} says: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast(f"Client #{client_id} left the chat")
```

## 带依赖注入的 WebSocket

WebSocket 端点支持与 HTTP 端点相同的依赖注入系统：

```python
from typing import Annotated
from fastapi import (
    Cookie,
    Depends,
    FastAPI,
    Query,
    WebSocket,
    WebSocketException,
    status,
)

app = FastAPI()

async def get_cookie_or_token(
    websocket: WebSocket,
    session: Annotated[str | None, Cookie()] = None,
    token: Annotated[str | None, Query()] = None,
):
    if session is None and token is None:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    return session or token

@app.websocket("/items/{item_id}/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    item_id: str,
    q: int | None = None,
    cookie_or_token: Annotated[str, Depends(get_cookie_or_token)] = "",
):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        await websocket.send_text(
            f"Session/Token: {cookie_or_token}, "
            f"Item: {item_id}, "
            f"Query: {q}, "
            f"Message: {data}"
        )
```

## WebSocket 认证

### 基于 Query 参数的 Token 认证

```python
import jwt
from fastapi import FastAPI, WebSocket, WebSocketException, status, Query
from typing import Annotated

app = FastAPI()
SECRET_KEY = "your-secret-key"

async def get_ws_current_user(
    websocket: WebSocket,
    token: Annotated[str | None, Query()] = None,
):
    if token is None:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        username = payload.get("sub")
        if username is None:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
        return username
    except jwt.InvalidTokenError:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    username: Annotated[str, Depends(get_ws_current_user)],
):
    await websocket.accept()
    await websocket.send_text(f"Welcome, {username}!")
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"{username}: {data}")
    except WebSocketDisconnect:
        pass
```

客户端连接方式：`ws://localhost:8000/ws?token=your-jwt-token`

### 基于首条消息的认证

```python
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    # 等待客户端发送认证消息
    auth_data = await websocket.receive_json()
    token = auth_data.get("token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        username = payload["sub"]
    except (jwt.InvalidTokenError, KeyError):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.send_json({"type": "auth_success", "user": username})
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"{username}: {data}")
    except WebSocketDisconnect:
        pass
```

## 带房间的聊天室

```python
from collections import defaultdict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

class RoomManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, room: str, websocket: WebSocket):
        await websocket.accept()
        self.rooms[room].append(websocket)

    def disconnect(self, room: str, websocket: WebSocket):
        self.rooms[room].remove(websocket)
        if not self.rooms[room]:
            del self.rooms[room]

    async def broadcast_to_room(self, room: str, message: str):
        for connection in self.rooms.get(room, []):
            await connection.send_text(message)

room_manager = RoomManager()

@app.websocket("/ws/{room}/{username}")
async def websocket_endpoint(
    websocket: WebSocket,
    room: str,
    username: str,
):
    await room_manager.connect(room, websocket)
    await room_manager.broadcast_to_room(room, f"{username} joined the room")
    try:
        while True:
            data = await websocket.receive_text()
            await room_manager.broadcast_to_room(room, f"{username}: {data}")
    except WebSocketDisconnect:
        room_manager.disconnect(room, websocket)
        await room_manager.broadcast_to_room(room, f"{username} left the room")
```

## 测试 WebSocket

```python
from fastapi.testclient import TestClient

def test_websocket():
    client = TestClient(app)
    with client.websocket_connect("/ws") as websocket:
        websocket.send_text("Hello")
        data = websocket.receive_text()
        assert data == "Echo: Hello"

def test_websocket_with_params():
    client = TestClient(app)
    with client.websocket_connect("/ws/room1/alice") as websocket:
        data = websocket.receive_text()
        assert "alice joined" in data
```

## 常见陷阱

- **WebSocket 不支持 HTTP 中间件**：`@app.middleware("http")` 不会拦截 WebSocket 请求，需要在 WebSocket 端点内部处理认证和日志
- **忘记处理 WebSocketDisconnect**：客户端断开连接时会抛出 `WebSocketDisconnect`，必须 try/except 处理，否则服务端报错
- **广播时某个连接失败**：`broadcast` 中如果某个客户端已断开但未清理，`send_text` 会抛异常。建议在 broadcast 中 try/except 逐个发送，失败的自动清理
- **WebSocket 不能返回 HTTP 响应**：WebSocket 端点不能 return 普通字典或 Response，只能通过 `websocket.send_*` 发送数据
- **认证时机**：WebSocket 的 HTTP 头只在握手阶段发送，之后无法更改。Bearer token 通常通过 query 参数或首条消息传递，不能使用 Authorization header（浏览器 WebSocket API 不支持自定义 header）
- **连接管理器需要考虑并发安全**：在多 worker 部署时，内存中的 ConnectionManager 只管理当前进程的连接，跨进程广播需要 Redis Pub/Sub 等方案

## 组合提示

- 配合 **fastapi-auth** 实现 WebSocket 认证
- 配合 **fastapi-dependencies** 使用依赖注入处理 WebSocket 参数
- 配合 **fastapi-testing** 使用 TestClient 的 `websocket_connect` 测试
- 配合 **fastapi-async** 理解 WebSocket 中的异步编程模型
