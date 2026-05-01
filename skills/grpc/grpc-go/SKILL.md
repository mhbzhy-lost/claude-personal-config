---
name: grpc-go
description: Build high-performance gRPC servers and clients in Go with protobuf code generation, all four RPC streaming types, TLS, keepalive, interceptors, and connection management.
tech_stack: [rpc]
language: [go]
capability: [rpc, observability, encryption]
version: "grpc-go v1.80.0"
collected_at: 2025-01-01
---

# gRPC Go

> Source: https://grpc.io/docs/languages/go/basics/, https://grpc.io/docs/languages/go/quickstart/, https://pkg.go.dev/google.golang.org/grpc, https://grpc.io/docs/guides/keepalive/

## Purpose

Package `google.golang.org/grpc` is the official Go implementation of gRPC — a high-performance, HTTP/2-first RPC framework. It provides servers (`grpc.Server`), client connections (`grpc.ClientConn`), pluggable interceptors, TLS, keepalive, load balancing, and the code generation pipeline (`protoc-gen-go` + `protoc-gen-go-grpc`) to turn `.proto` definitions into type-safe Go interfaces.

## When to Use

- Building Go microservices that communicate via protobuf contracts
- Services requiring streaming: server-side, client-side, or bidirectional data flows
- Replacing REST/JSON with efficient binary serialization and HTTP/2 multiplexing
- Interoperability with gRPC services written in other languages (proto-first polyglot systems)
- Environments where connection management matters: keepalive for long-lived streams, idle timeout, max connection age

## Basic Usage

### Installation & Code Generation

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
export PATH="$PATH:$(go env GOPATH)/bin"

# Generate from proto
protoc --go_out=. --go_opt=paths=source_relative \
       --go-grpc_out=. --go-grpc_opt=paths=source_relative \
       routeguide/route_guide.proto
```

Produces:
- `*.pb.go` — message serialization
- `*_grpc.pb.go` — client stub interface + server interface

### Minimal Server

```go
type server struct {
    pb.UnimplementedGreeterServer
}

func (s *server) SayHello(ctx context.Context, in *pb.HelloRequest) (*pb.HelloReply, error) {
    return &pb.HelloReply{Message: "Hello " + in.GetName()}, nil
}

func main() {
    lis, _ := net.Listen("tcp", ":50051")
    s := grpc.NewServer()
    pb.RegisterGreeterServer(s, &server{})
    s.Serve(lis) // blocks until Stop() or GracefulStop()
}
```

Embed `pb.UnimplementedXxxServer` for forward compatibility — new methods added to the service later won't break compilation.

### Minimal Client

```go
conn, err := grpc.NewClient("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
if err != nil { log.Fatal(err) }
defer conn.Close()

client := pb.NewGreeterClient(conn)
ctx, cancel := context.WithTimeout(context.Background(), time.Second)
defer cancel()

resp, err := client.SayHello(ctx, &pb.HelloRequest{Name: "World"})
```

**Always use `context.WithTimeout`** — without a deadline, a broken connection can block forever.

### TLS Setup

**Server:**
```go
creds, _ := credentials.NewServerTLSFromFile("cert.pem", "key.pem")
s := grpc.NewServer(grpc.Creds(creds))
```

**Client:**
```go
creds, _ := credentials.NewClientTLSFromFile("ca.pem", "server.example.com")
conn, _ := grpc.NewClient("server.example.com:50051", grpc.WithTransportCredentials(creds))
```

### Four RPC Types

| Type | Server Handler Signature | Client Call Pattern |
|------|--------------------------|---------------------|
| **Unary** | `func(ctx, *Req) (*Res, error)` | `res, err := stub.Method(ctx, req)` |
| **Server-streaming** | `func(req *Req, stream XxxServer) error` | `stream, _ := stub.Method(ctx, req)` then `stream.Recv()` loop until `io.EOF` |
| **Client-streaming** | `func(stream XxxServer) error` | `stream, _ := stub.Method(ctx)` then `stream.Send(...)` loop, finally `stream.CloseAndRecv()` |
| **Bidirectional** | `func(stream XxxServer) error` | `stream, _ := stub.Method(ctx)`; read in goroutine, write in main, `stream.CloseSend()` |

**Server-streaming server:**
```go
func (s *srv) ListFeatures(rect *pb.Rectangle, stream pb.RouteGuide_ListFeaturesServer) error {
    for _, f := range s.features {
        if inRange(f, rect) {
            if err := stream.Send(f); err != nil { return err }
        }
    }
    return nil
}
```

**Bidirectional client:**
```go
stream, _ := client.RouteChat(ctx)
go func() {
    for {
        in, err := stream.Recv()
        if err == io.EOF { close(waitc); return }
        // handle in
    }
}()
for _, note := range notes { stream.Send(note) }
stream.CloseSend()
<-waitc
```

## Key APIs (Summary)

### Server — construction options that cover 80% of use cases

```go
s := grpc.NewServer(
    grpc.Creds(creds),                          // TLS
    grpc.UnaryInterceptor(myInterceptor),        // single interceptor
    grpc.ChainUnaryInterceptor(a, b, c),          // chained interceptors
    grpc.KeepaliveParams(kp),                     // server keepalive
    grpc.KeepaliveEnforcementPolicy(ep),          // keepalive enforcement
    grpc.MaxConcurrentStreams(100),               // stream limit
    grpc.MaxRecvMsgSize(4*1024*1024),             // 4MB max message
    grpc.ConnectionTimeout(10*time.Second),
)
```

### Client — DialOption functions that cover 80% of use cases

```go
conn, _ := grpc.NewClient(target,
    grpc.WithTransportCredentials(creds),         // TLS
    grpc.WithUnaryInterceptor(myInterceptor),      // single interceptor
    grpc.WithChainUnaryInterceptor(a, b, c),       // chained interceptors
    grpc.WithKeepaliveParams(kp),                  // client keepalive
    grpc.WithConnectParams(grpc.ConnectParams{     // backoff
        Backoff:           backoff.DefaultConfig,
        MinConnectTimeout: 5 * time.Second,
    }),
    grpc.WithDefaultServiceConfig(`{...}`),        // LB policy, retry config
    grpc.WithUserAgent("my-app/1.0"),
    grpc.WithIdleTimeout(5*time.Minute),
)
```

### Per-Call Options

```go
var header, trailer metadata.MD
resp, err := client.SayHello(ctx, req,
    grpc.Header(&header),
    grpc.Trailer(&trailer),
    grpc.MaxCallRecvMsgSize(1024*1024),
    grpc.UseCompressor("gzip"),
)
```

### Context Helpers

```go
method, ok := grpc.Method(ctx)                  // "/package.Service/Method"
grpc.SetHeader(ctx, metadata.Pairs("key", "val"))
grpc.SetTrailer(ctx, metadata.Pairs("trace-id", id))
grpc.SendHeader(ctx, metadata.Pairs("version", "1"))
```

### Server Lifecycle

| Method | Behavior |
|--------|----------|
| `Serve(lis)` | Block until listener fails or `Stop()`/`GracefulStop()` called |
| `Stop()` | Immediately stop; abort in-flight RPCs |
| `GracefulStop()` | Stop accepting new RPCs; wait for in-flight RPCs to complete |

### Client Connection States

`connectivity.State`: `Idle` → `Connecting` → `Ready` → `TransientFailure` → `Shutdown`

Use `conn.GetState()` and `conn.WaitForStateChange(ctx, state)` for health-aware logic. `conn.Connect()` initiates connection (non-blocking).

## Keepalive Configuration

HTTP/2 PING-based keepalive detects broken connections. Two layers: parameters and enforcement.

### Client (`keepalive.ClientParameters`)

```go
keepalive.ClientParameters{
    Time:                30 * time.Second,  // PING interval (default Infinity = off)
    Timeout:             10 * time.Second,  // wait for ACK (default 20s)
    PermitWithoutStream: false,             // DON'T enable without streams
}
```

### Server (`keepalive.ServerParameters`)

```go
keepalive.ServerParameters{
    MaxConnectionIdle:     15 * time.Minute,  // idle → GOAWAY (default Infinity)
    MaxConnectionAge:      30 * time.Minute,  // max lifetime → GOAWAY
    MaxConnectionAgeGrace:  5 * time.Minute,  // grace after max age
    Time:                   5 * time.Minute,  // server PING interval (default 2h)
    Timeout:               15 * time.Second,  // wait for ACK (default 20s)
}
```

### Server Enforcement (`keepalive.EnforcementPolicy`)

```go
keepalive.EnforcementPolicy{
    MinTime:              5 * time.Minute,  // minimum client PING interval
    PermitWithoutStream:  false,             // reject pings without streams
}
```

**Critical:** Do NOT enable keepalive without streams. Do NOT set intervals below 1 minute. Unsupported keepalive results in `GOAWAY` with `too_many_pings`. Coordinate client keepalive with service owners.

## Caveats

1. **`grpc.NewClient` replaces deprecated `Dial`/`DialContext`.** All new code should use `NewClient`. The old functions still work but are going away.

2. **RPCs are blocking in Go.** Unlike some gRPC implementations, Go RPCs block until a response arrives or an error occurs. Use goroutines for concurrent calls.

3. **Always set deadlines.** `context.WithTimeout` is not optional — a hung connection without a deadline blocks forever.

4. **Embed `UnimplementedXxxServer`** in your server struct. It provides default implementations for all methods, so adding methods to the proto later won't break compilation.

5. **"transport is closing"** (`Unavailable`) has many root causes: TLS misconfiguration, proxy interference, server restart, keepalive-triggered termination. Enable verbose logging on both sides: `GRPC_GO_LOG_VERBOSITY_LEVEL=99 GRPC_GO_LOG_SEVERITY_LEVEL=info`.

6. **`SendHeader` vs `SetHeader`:** `SetHeader` accumulates; `SendHeader` sends immediately (at most once). Both become no-ops after the first response byte or status is sent.

7. **`io.EOF` from `stream.Recv()` is normal** — it signals the peer finished sending. Do NOT treat it as an error. In client-streaming servers, return your response after receiving EOF.

8. **Use `status` package for errors.** `status.Errorf(codes.InvalidArgument, "...")` for server-side, `status.Code(err)` and `status.Convert(err)` for client-side. Avoid deprecated `grpc.Errorf`, `grpc.Code`, `grpc.ErrorDesc`.

9. **TCP_USER_TIMEOUT is auto-enabled with keepalive.** On Linux, it's set to `KEEPALIVE_TIMEOUT`. But it only monitors the TCP connection to the load balancer — PING frames propagate through LBs and detect end-to-end breaks.

10. **`RegisterService` with `ServiceDesc`** is the programmatic registration path when generated `RegisterXxxServer` helpers aren't sufficient.

## Composition Hints

- **Start with `insecure.NewCredentials()`** for local dev, then graduate to TLS. The `insecure` package must be explicitly imported — this is intentional to make "no security" a conscious choice.

- **Use `WithChainUnaryInterceptor` over multiple `WithUnaryInterceptor` calls.** Chaining is order-preserving and avoids the confusion of which interceptor runs first.

- **Keepalive: set server `MaxConnectionAge` below your load balancer's timeout.** This ensures gRPC gracefully cycles connections before the LB forcibly closes them, avoiding `Unavailable` errors on active RPCs. A 30-minute `MaxConnectionAge` with a 5-minute `Grace` is a common starting point.

- **For connection pooling,** create one `ClientConn` per target and reuse it. `ClientConn` manages multiple HTTP/2 connections internally and is safe for concurrent use.

- **For retry:** use gRPC service config rather than hand-rolling retry in interceptors. Enable with `WithDefaultServiceConfig()` and disable with `WithDisableRetry()` when retries are harmful (non-idempotent operations).

- **For load balancing:** the default is `pick_first`. Use `WithDefaultServiceConfig(`{"loadBalancingConfig": [{"round_robin":{}}]}`)` for round-robin. Provide custom resolvers with `WithResolvers()`.

- **For health checking:** implement the `grpc.health.v1.Health` service. Disable client-side health checking with `WithDisableHealthCheck()` if not needed.

- **Monorepo proto layout tip:** Use `go_package` option in `.proto` files matching your Go module path. Combine `--go_opt=paths=source_relative` with `--go-grpc_opt=paths=source_relative` so generated files sit alongside `.proto` files.
