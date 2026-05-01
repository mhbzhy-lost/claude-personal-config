---
name: grpc-interceptors
description: Generic cross-cutting behavior (auth, logging, metrics, caching, rate limiting) for gRPC unary and stream RPCs via client-side and server-side interceptors in Go and Python.
tech_stack: [rpc]
language: [go, python]
capability: [auth, observability, rpc]
version: "grpc unversioned"
collected_at: 2025-01-01
---

# gRPC Interceptors

> Source: https://grpc.io/docs/guides/interceptors/, https://grpc.io/docs/languages/go/basics/, https://grpc.io/docs/languages/python/basics/, https://grpc.github.io/grpc/python/grpc_asyncio.html

## Purpose

Interceptors are gRPC's middleware mechanism — they hook into every RPC on a channel (client-side) or server (server-side) to implement generic, method-independent behavior. They are the primary extension point for auth, logging, metrics, caching, fault injection, rate limiting, and policy enforcement without modifying individual service handlers.

## When to Use

Use interceptors when you need behavior applied uniformly across most or all RPC methods:

| Use Case | Side | Notes |
|----------|------|-------|
| Authentication / Authorization | Server | Validate credentials, check permissions |
| Logging | Client & Server | Log requests, responses, latency |
| Metrics / Monitoring | Client & Server | Counters, histograms per method |
| Rate Limiting | Server | Reject excess calls before handler |
| Caching | Client | Return cached responses, skip network |
| Fault Injection | Client & Server | Inject errors/ delays for testing |
| Deadline Propagation | Client & Server | Enforce or inject timeouts |
| Metadata Handling | Client & Server | Read/write custom headers/trailers |
| Retry / Hedging | Client | Re-issue failed calls transparently |

Do NOT use interceptors for: TCP connection management, port configuration, TLS setup, or client-side auth (use the Call Credentials API instead).

## Basic Usage

### Go: Client Interceptor (Unary)

```go
func loggingUnaryInterceptor(
    ctx context.Context,
    method string,
    req, reply interface{},
    cc *grpc.ClientConn,
    invoker grpc.UnaryInvoker,
    opts ...grpc.CallOption,
) error {
    start := time.Now()
    err := invoker(ctx, method, req, reply, cc, opts...)
    log.Printf("Invoked %s (%v) err=%v", method, time.Since(start), err)
    return err
}

// Attach to client
conn, _ := grpc.NewClient(target,
    grpc.WithUnaryInterceptor(loggingUnaryInterceptor),
)
```

### Go: Server Interceptor (Unary)

```go
func loggingServerInterceptor(
    ctx context.Context,
    req interface{},
    info *grpc.UnaryServerInfo,
    handler grpc.UnaryHandler,
) (interface{}, error) {
    start := time.Now()
    resp, err := handler(ctx, req)
    log.Printf("Handled %s (%v) err=%v", info.FullMethod, time.Since(start), err)
    return resp, err
}

// Attach to server
s := grpc.NewServer(
    grpc.UnaryInterceptor(loggingServerInterceptor),
)
```

### Go: Chaining Multiple Interceptors

```go
// Client
conn, _ := grpc.NewClient(target,
    grpc.WithChainUnaryInterceptor(authInterceptor, loggingInterceptor, retryInterceptor),
    grpc.WithChainStreamInterceptor(authStreamInterceptor, loggingStreamInterceptor),
)

// Server
s := grpc.NewServer(
    grpc.ChainUnaryInterceptor(authInterceptor, rateLimitInterceptor, loggingInterceptor),
    grpc.ChainStreamInterceptor(authStreamInterceptor, loggingStreamInterceptor),
)
```

### Go: Stream Interceptor (Server)

```go
func loggingStreamInterceptor(
    srv interface{},
    ss grpc.ServerStream,
    info *grpc.StreamServerInfo,
    handler grpc.StreamHandler,
) error {
    start := time.Now()
    err := handler(srv, ss)
    log.Printf("Stream %s (%v) err=%v", info.FullMethod, time.Since(start), err)
    return err
}
```

### Python Sync: Client Interceptor

```python
class LoggingClientInterceptor(grpc.UnaryUnaryClientInterceptor):
    def intercept_unary_unary(self, continuation, client_call_details, request):
        start = time.time()
        response = continuation(client_call_details, request)
        elapsed = time.time() - start
        logging.info(f"RPC {client_call_details.method} ({elapsed:.3f}s)")
        return response

channel = grpc.insecure_channel('localhost:50051')
intercept_channel = grpc.intercept_channel(channel, LoggingClientInterceptor())
stub = route_guide_pb2_grpc.RouteGuideStub(intercept_channel)
```

### Python AsyncIO: Client Interceptor

```python
class AsyncLoggingInterceptor(grpc.aio.UnaryUnaryClientInterceptor):
    async def intercept_unary_unary(self, continuation, client_call_details, request):
        start = time.time()
        response = await continuation(client_call_details, request)
        elapsed = time.time() - start
        logging.info(f"RPC {client_call_details.method} ({elapsed:.3f}s)")
        return response

channel = grpc.aio.insecure_channel('localhost:50051', interceptors=[AsyncLoggingInterceptor()])
```

### Python AsyncIO: Server Interceptor

```python
channel = grpc.aio.server(
    interceptors=[loggingInterceptor, authInterceptor],
    maximum_concurrent_rpcs=100,
)
```

## Key APIs (Summary)

| Language | Unary Client Interceptor Signature | Stream Client Interceptor | Server Unary | Server Stream |
|----------|------------------------------------|--------------------------|--------------|---------------|
| Go | `func(ctx, method, req, reply, cc, invoker, opts...) error` | `func(ctx, desc, cc, method, streamer, opts...) (ClientStream, error)` | `func(ctx, req, info, handler) (resp, error)` | `func(srv, ss, info, handler) error` |
| Python Sync | `intercept_unary_unary(continuation, call_details, request)` | `intercept_stream_unary(...)` etc. | `intercept_service(continuation, handler_call_details)` | same entry point |
| Python aio | `async intercept_unary_unary(continuation, call_details, request)` | async variants per stream type | `interceptors` list on `grpc.aio.server()` (**EXPERIMENTAL**) | same |

**Go helper: `grpc.UnaryServerInfo`** provides `FullMethod` (e.g. `"/routeguide.RouteGuide/GetFeature"`).

**Go helper: `grpc.StreamServerInfo`** provides `FullMethod`, `IsClientStream`, `IsServerStream`.

**Python `ServicerContext` / `RpcContext`** provides `time_remaining()`, `cancel()`, `cancelled()`, `done()`, `add_done_callback()`, and metadata access.

## Caveats

1. **Interceptor order matters.** First registered = outermost (closest to network). Logging-after-caching skips logging cache hits; logging-before-caching logs every call including cache hits. Choose deliberately.

2. **Per-call, not per-connection.** Interceptors fire per RPC invocation. They cannot manage TCP connections, ports, or TLS — use `DialOption`/`ServerOption` for those.

3. **Client-side auth uses Call Credentials, not interceptors.** gRPC has a dedicated `credentials.PerRPCCredentials` API better suited to attaching tokens.

4. **Python AsyncIO objects are not thread-safe.** Use only on the creation thread.

5. **Blocking code in AsyncIO coroutines starves all RPCs.** Always `await` — never `time.sleep()`.

6. **Python `grpc.aio.server()` interceptors are EXPERIMENTAL.** The API may change.

7. **`context.cancel()` is idempotent** but has no effect after the RPC has terminated.

8. **Stream interceptors must propagate errors correctly.** If the wrapped handler returns an error, the interceptor should return it (possibly wrapping it) — swallowing errors silently breaks gRPC status propagation.

## Composition Hints

- **Chain order mental model:** interceptors form a stack — first registered = outermost. Think "network → auth → rate-limit → logging → handler."
- **Go chaining:** Use `ChainUnaryInterceptor` / `ChainStreamInterceptor` (server) and `WithChainUnaryInterceptor` / `WithChainStreamInterceptor` (client) for clean multi-interceptor setup without nested wrappers.
- **Python chaining:** Use `grpc.intercept_channel()` or `grpc.aio.insecure_channel(interceptors=[...])` — interceptors execute in list order.
- **Separate concerns:** One interceptor per responsibility (auth, logging, metrics, etc.) rather than monolithic interceptors.
- **Avoid side-effects in interceptor that handlers depend on.** Interceptors should be transparent — a handler should not break if an interceptor is removed.
- **For timeout/deadline:** Read `context.time_remaining()` in the interceptor; if exceeded before invoking the handler, short-circuit with `status.DeadlineExceeded`.
