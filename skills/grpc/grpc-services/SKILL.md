---
name: grpc-services
description: Defining gRPC services in proto3 and implementing servers/clients — four RPC types, streaming lifecycles, and Go patterns.
tech_stack: [grpc]
language: [go]
capability: [rpc, api-design]
version: "gRPC Go v1.80.0"
collected_at: 2025-07-16
---

# gRPC Services — Definition, Server & Client Patterns

> Source: https://grpc.io/docs/what-is-grpc/introduction/, https://grpc.io/docs/languages/go/basics/

## Purpose

gRPC lets a client call methods on a remote server as if they were local.
Services and RPC methods are defined in `.proto` files; `protoc` plugins
generate type-safe client stubs and server interfaces. By default, gRPC uses
Protocol Buffers (proto3) as the IDL and wire format.

## When to Use

- Microservice-to-microservice communication.
- High-throughput, low-latency internal APIs.
- Streaming: real-time feeds, large result sets, bidirectional chat.
- Polyglot systems — a Go server serving Java, Python, Ruby clients (or vice
  versa).
- Any API that benefits from generated type-safe clients and strong contracts.

## Basic Usage

### 1. Define the service in a .proto file

```proto
syntax = "proto3";

service RouteGuide {
  // Simple: one request, one response
  rpc GetFeature(Point) returns (Feature) {}

  // Server-streaming: one request, stream of responses
  rpc ListFeatures(Rectangle) returns (stream Feature) {}

  // Client-streaming: stream of requests, one response
  rpc RecordRoute(stream Point) returns (RouteSummary) {}

  // Bidirectional: both sides stream independently
  rpc RouteChat(stream RouteNote) returns (stream RouteNote) {}
}

message Point { int32 latitude = 1; int32 longitude = 2; }
message Feature { string name = 1; Point location = 2; }
message Rectangle { Point lo = 1; Point hi = 2; }
message RouteNote { Point location = 1; string message = 2; }
message RouteSummary {
  int32 point_count = 1; int32 feature_count = 2;
  int32 distance = 3; int32 elapsed_time = 4;
}
```

### 2. Generate code

```bash
protoc --go_out=. --go_opt=paths=source_relative \
       --go-grpc_out=. --go-grpc_opt=paths=source_relative \
       routeguide/route_guide.proto
```

Produces:
- `*.pb.go` — message serialization/accessors.
- `*_grpc.pb.go` — `RouteGuideClient` interface (stub) and
  `RouteGuideServer` interface (to implement).

### 3. Implement the server

```go
// Bootstrap
lis, _ := net.Listen("tcp", "localhost:50051")
grpcServer := grpc.NewServer()
pb.RegisterRouteGuideServer(grpcServer, &routeGuideServer{})
grpcServer.Serve(lis) // blocking
```

### 4. Create a client

```go
conn, _ := grpc.NewClient("localhost:50051", opts...)
defer conn.Close()
client := pb.NewRouteGuideClient(conn)
// Reuse conn across RPCs — don't create one per call.
```

## Key APIs (Summary)

### Four RPC types — Go method signatures

| RPC Type | Server method signature | Key stream method |
|---|---|---|
| Simple | `f(ctx, *Req) (*Resp, error)` | — |
| Server-streaming | `f(*Req, stream) error` | `stream.Send()` |
| Client-streaming | `f(stream) error` | `stream.Recv()`, `stream.SendAndClose()` |
| Bidirectional | `f(stream) error` | `stream.Recv()`, `stream.Send()` |

### Server streaming handlers — lifecycle

**Server-side streaming**: send multiple responses, then `return nil`.
```go
func (s *server) ListFeatures(rect *pb.Rectangle, stream pb.RouteGuide_ListFeaturesServer) error {
    for _, f := range results {
        if err := stream.Send(f); err != nil { return err }
    }
    return nil // signals graceful completion
}
```

**Client-side streaming**: `Recv()` in a loop until `io.EOF`, then `SendAndClose()`.
```go
func (s *server) RecordRoute(stream pb.RouteGuide_RecordRouteServer) error {
    for {
        point, err := stream.Recv()
        if err == io.EOF { return stream.SendAndClose(summary) }
        if err != nil { return err }
        // accumulate point...
    }
}
```

**Bidirectional**: `Recv()` loop; `Send()` responses concurrently.
```go
func (s *server) RouteChat(stream pb.RouteGuide_RouteChatServer) error {
    for {
        in, err := stream.Recv()
        if err == io.EOF { return nil }
        if err != nil { return err }
        for _, note := range lookupNotes(in) {
            if err := stream.Send(note); err != nil { return err }
        }
    }
}
```

### Client calling patterns

```go
// Simple
resp, err := client.GetFeature(ctx, &pb.Point{Latitude: 409146138, Longitude: -746188906})

// Server-streaming
stream, _ := client.ListFeatures(ctx, rect)
for { f, err := stream.Recv(); err == io.EOF { break }; /* use f */ }

// Client-streaming
stream, _ := client.RecordRoute(ctx)
for _, p := range points { stream.Send(p) }
reply, _ := stream.CloseAndRecv()

// Bidirectional
stream, _ := client.RouteChat(ctx)
go func() { for { in, err := stream.Recv(); ... } }()  // concurrent recv
for _, note := range notes { stream.Send(note) }
stream.CloseSend()
<-waitc
```

## Caveats

### Streaming lifecycle rules — MUST follow

- **Server-side streaming**: return `nil` to finish; non-nil error → gRPC error
  status.
- **Client-side streaming**: call `CloseAndRecv()` — not `CloseSend()` +
  separate `Recv()`.
- **Bidirectional**: call `CloseSend()` when done sending; keep reading until
  peer closes (`io.EOF`).
- Every `Recv()` call must check for `io.EOF` and non-nil errors.

### Context is critical

- All handlers receive `context.Context`. It's cancelled when the client
  disconnects or the deadline expires.
- Client calls should pass a context with timeout: `context.WithTimeout(ctx, 5*time.Second)`.
- gRPC-Go RPCs are blocking/synchronous — a simple RPC call blocks until the
  server responds.

### Connection management

- `grpc.NewClient()` creates a connection pool (channel). Reuse it — do not
  create a new one per RPC.
- Always `defer conn.Close()`.
- Use `grpc.DialOption` for TLS credentials, auth interceptors, etc.

### Code generation hygiene

- One service per `.proto` file to avoid dependency bloat.
- Generated `*_grpc.pb.go` must stay in sync with the `.proto` — regenerate on
  every change.
- Use proto3 (not proto2) for gRPC — it supports the full range of gRPC
  languages.

### Message rules (proto3)

- Field numbers are permanent; never reuse. Use `reserved` when deleting.
- First enum value must be zero, conventionally `UNSPECIFIED`.
- Use `optional` for scalar fields that need presence detection.

## Composition Hints

- **Error handling**: return meaningful `status.Errorf(codes.NotFound, "...")`
  instead of plain `errors.New()` — they're transmitted as gRPC status codes.
- **Interceptors**: use `grpc.UnaryInterceptor` / `grpc.StreamInterceptor` for
  logging, auth, metrics across all RPCs.
- **Deadlines**: always set a deadline on the client side; the server context
  inherits it. This prevents hanging RPCs.
- **Keep-alive**: configure `keepalive.ClientParameters` and
  `keepalive.ServerParameters` for long-lived connections.
- For Go specifically, use `proto.Equal()` to compare message values — simple
  `==` does not work for protobuf messages.
