---
name: grpc-python
description: Python gRPC implementation with grpcio — sync and AsyncIO APIs, protoc code generation, all four RPC types (unary, server-streaming, client-streaming, bidirectional)
tech_stack: [rpc]
language: [python]
capability: [rpc, api-design]
version: "gRPC Python (grpcio) unversioned"
collected_at: 2025-01-27
---

# gRPC Python (grpcio)

> Source: https://grpc.io/docs/languages/python/basics/, https://grpc.io/docs/languages/python/quickstart/, https://grpc.io/docs/languages/python/generated-code/, https://grpc.github.io/grpc/python/grpc_asyncio.html

## Purpose

gRPC Python provides the Python implementation of gRPC using the `grpcio` package. It supports code generation from `.proto` files via `grpcio-tools`, producing `_pb2.py` (message classes) and `_pb2_grpc.py` (stub, servicer, registration function). Two APIs are available: the synchronous `grpc` module (thread-pool based) and the modern `grpc.aio` module (AsyncIO-native).

## When to Use

- Building typed, efficient RPC communication between Python microservices
- When you need all 4 RPC types: unary, server-streaming, client-streaming, bidirectional-streaming
- High-concurrency applications → use `grpc.aio` (AsyncIO-native)
- Traditional blocking/thread-per-request → use synchronous `grpc` with `ThreadPoolExecutor`
- When you need client/server interceptors for cross-cutting concerns

## Basic Usage

### Installation

```bash
pip install grpcio            # gRPC runtime
pip install grpcio-tools      # protoc plugin for codegen
```

### Code Generation

```bash
python -m grpc_tools.protoc -I../../protos \
    --python_out=. --pyi_out=. --grpc_python_out=. \
    ../../protos/route_guide.proto
```

Generates `route_guide_pb2.py` (messages) and `route_guide_pb2_grpc.py` (stub + servicer + registration function).

### Synchronous Server

```python
import grpc
from concurrent import futures
import route_guide_pb2_grpc

class RouteGuideServicer(route_guide_pb2_grpc.RouteGuideServicer):
    def GetFeature(self, request, context):
        # Unary: return a single response
        return route_guide_pb2.Feature(name="Eiffel Tower", location=request)

    def ListFeatures(self, request, context):
        # Server-streaming: yield responses
        for feature in self.db:
            yield feature

    def RecordRoute(self, request_iterator, context):
        # Client-streaming: iterate request messages, return one response
        for point in request_iterator:
            ...
        return route_guide_pb2.RouteSummary(...)

    def RouteChat(self, request_iterator, context):
        # Bidirectional: iterate requests, yield responses
        for note in request_iterator:
            yield some_response

server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
route_guide_pb2_grpc.add_RouteGuideServicer_to_server(RouteGuideServicer(), server)
server.add_insecure_port('[::]:50051')
server.start()
server.wait_for_termination()
```

### Synchronous Client

```python
channel = grpc.insecure_channel('localhost:50051')
stub = route_guide_pb2_grpc.RouteGuideStub(channel)

# Unary (sync)
feature = stub.GetFeature(point)

# Unary (async via future)
future = stub.GetFeature.future(point)
feature = future.result()

# Server-streaming
for feature in stub.ListFeatures(rectangle):
    print(feature)

# Client-streaming
summary = stub.RecordRoute(iter(points))

# Bidirectional
for note in stub.RouteChat(iter(notes)):
    print(note)
```

### AsyncIO Server (grpc.aio)

```python
import grpc.aio

async def serve():
    server = grpc.aio.server(
        interceptors=[...],
        maximum_concurrent_rpcs=100,
    )
    server.add_insecure_port('[::]:50051')
    await server.start()
    await server.wait_for_termination()
```

### AsyncIO Client (grpc.aio)

```python
async def run():
    async with grpc.aio.insecure_channel('localhost:50051') as channel:
        stub = MyServiceStub(channel)
        response = await stub.GetFeature(point)  # unary-unary

        # Server-streaming
        async for feature in stub.ListFeatures(rect):
            print(feature)
```

## Key APIs (Summary)

### Three Generated Code Elements

For each service `Foo` in the `.proto`:

| Element | Purpose |
|---------|---------|
| `FooStub` | Client stub. Constructor takes `grpc.Channel`. Methods become `UnaryUnaryMultiCallable` / `UnaryStreamMultiCallable` / etc. |
| `FooServicer` | Server base class. Override methods to implement service logic. |
| `add_FooServicer_to_server` | Registration function. Binds a servicer to a `grpc.Server`. |

### grpc.aio.Channel Key Methods

| Method | Description |
|--------|-------------|
| `async channel_ready()` | Blocks until channel is READY |
| `async close(grace=None)` | Closes channel; if `grace` set, waits for active RPCs; idempotent |
| `get_state(try_to_connect=False)` | Returns `ChannelConnectivity` (experimental) |
| `unary_unary(method, ...)` | Creates a `UnaryUnaryMultiCallable` |
| `unary_stream(method, ...)` | Creates a `UnaryStreamMultiCallable` |
| `stream_unary(method, ...)` | Creates a `StreamUnaryMultiCallable` |
| `stream_stream(method, ...)` | Creates a `StreamStreamMultiCallable` |

### grpc.aio.Server Key Methods

| Method | Description |
|--------|-------------|
| `async start()` | Starts server; call ONCE only |
| `async stop(grace)` | Stops new RPCs immediately; waits for active RPCs if `grace` set; idempotent; most restrictive `grace` wins |
| `async wait_for_termination(timeout=None)` | Blocks until server stops or timeout |
| `add_insecure_port(address)` | Returns port number (int) |

### AsyncIO Exceptions

- `grpc.aio.AioRpcError` — snapshot of final RPC status; `code()`, `details()`, `initial_metadata()`, `trailing_metadata()` are all sync (no await)
- `grpc.aio.UsageError` — inappropriate API usage (e.g., RPC on closed channel)
- `grpc.aio.AbortError` — raised on `abort()` in servicer methods

### grpc.aio.Metadata

Mapping `str → List[str]`, multiple values per key, order-preserving. Key ops: `__getitem__`, `__setitem__`, `__delitem__`, `get_all(key)`, `delete_all(key)`.

## Caveats

- **Thread safety for AsyncIO**: `grpc.aio` objects must only be used on the thread that created them. AsyncIO doesn't provide thread safety.
- **Blocking in AsyncIO**: Any blocking call inside a coroutine starves the event loop and all active RPCs.
- **`server.start()` is non-blocking**: For sync servers, call `server.wait_for_termination()` or the main thread exits.
- **pb2 ≠ proto2**: The `2` in `_pb2.py` means Protocol Buffers Python API version 2 (v1 is obsolete). It has nothing to do with `syntax = "proto2"` vs `"proto3"`.
- **Custom package paths**: Use `protoc -I<custom/package/path>=<proto_dir>` to control import structure in generated code.
- **`.future()` for unary RPCs**: Both sync (`stub.Method(req)`) and async-via-future (`stub.Method.future(req).result()`) are available for unary-unary methods.

## Composition Hints

- **Pair with `grpc-services`**: Know the 4 RPC type semantics before implementing in Python.
- **Pair with `grpc-proto3`**: Understand proto3 message/enum/service syntax to write `.proto` files before codegen.
- **Pair with `grpc-interceptors`**: Add logging, auth, rate-limiting via Python interceptors on both client and server.
- **Pair with `grpc-production`**: For TLS/mTLS, use `grpc.ssl_channel_credentials()` and `grpc.ssl_server_credentials()`, keepalive config via channel options.
- **AsyncIO is the modern path**: Prefer `grpc.aio` for new projects; the sync API is stable but the AsyncIO API is the strategic direction.
