---
name: grpc-web
description: Use gRPC from browser clients via Envoy proxy with code generation, unary and server-streaming RPC support.
tech_stack: [web, frontend]
language: [javascript, typescript]
capability: [rpc, http-client]
version: "grpc-web 2.0.2"
collected_at: 2025-09-17
---

# gRPC-Web

> Source: https://grpc.io/docs/platforms/web/basics/, https://grpc.io/docs/platforms/web/quickstart/, https://github.com/grpc/grpc-web

## Purpose

gRPC-Web is a JavaScript implementation of gRPC for browser clients. Browsers cannot speak raw HTTP/2 gRPC, so gRPC-Web uses a proxy (default: Envoy) to translate between browser-friendly HTTP/1.1 requests and backend gRPC services. It supports code generation from `.proto` files, producing typed client stubs for both JavaScript and TypeScript.

## When to Use

- You have existing gRPC backends and need browser clients to call them
- You want protobuf serialization and typed code generation in the browser
- You need **server-side streaming** from the browser (only in `grpcwebtext` mode)
- **Do NOT use** if you need client-side or bidirectional streaming — use Connect protocol instead

## Basic Usage

### 1. Define your service (echo.proto)

```protobuf
message EchoRequest { string message = 1; }
message EchoResponse { string message = 1; }

service EchoService {
  rpc Echo(EchoRequest) returns (EchoResponse);
  rpc ServerStreamingEcho(ServerStreamingEchoRequest) returns (stream ServerStreamingEchoResponse);
}
```

### 2. Configure Envoy proxy

The Envoy proxy listens on `:8080` and forwards gRPC-Web requests to the backend gRPC server on `:9090`. The critical filter is `envoy.grpc_web` in the HTTP filter chain:

```yaml
http_filters:
- name: envoy.grpc_web
- name: envoy.filters.http.router
```

The upstream cluster must use `http2_protocol_options: {}` since the backend speaks gRPC (HTTP/2). Add CORS configuration for cross-origin browser requests.

### 3. Generate client code

```bash
protoc -I=$DIR echo.proto \
  --js_out=import_style=commonjs:$OUT_DIR \
  --grpc-web_out=import_style=commonjs,mode=grpcwebtext:$OUT_DIR
```

This produces `echo_pb.js` (message classes) and `echo_grpc_web_pb.js` (service client stub).

### 4. Call from the browser

**Unary RPC (callback style):**

```js
const {EchoServiceClient} = require('./echo_grpc_web_pb.js');
const echoService = new EchoServiceClient('http://localhost:8080');

const request = new EchoRequest();
request.setMessage('Hello World!');

echoService.echo(request, {'custom-header-1': 'value1'}, function(err, response) {
  if (err) {
    console.log(err.code, err.message);
  } else {
    console.log(response.getMessage());
  }
});
```

**Server-side streaming:**

```js
const stream = echoService.serverStreamingEcho(streamRequest, metadata);
stream.on('data', (response) => console.log(response.getMessage()));
stream.on('status', (status) => console.log(status.code, status.details));
stream.on('end', () => { /* stream ended */ });
stream.cancel(); // to abort early
```

**Setting a deadline (Unix timestamp in ms):**

```js
const deadline = Date.now() + 1000;
client.sayHelloAfterDelay(request, {deadline: String(deadline)}, (err, response) => {
  // err populated if RPC exceeds deadline
});
```

### 5. Bundle for the browser

```bash
npm install
npx webpack client.js
```

Embed the resulting `dist/main.js` in your HTML.

## Key APIs (Summary)

| API | Description |
|---|---|
| `new ServiceClient(url)` | Create a callback-based client |
| `new ServicePromiseClient(url)` | Create a Promise-based client (no `.on()` callbacks) |
| `client.method(request, metadata, callback)` | Unary RPC call |
| `client.method(request, metadata)` → stream | Server-streaming call |
| `stream.on('data' / 'status' / 'end')` | Stream event handlers |
| `stream.cancel()` | Abort an in-progress stream |
| `{deadline: String(ms)}` | Per-call deadline header |

**Wire format modes** (set via `--grpc-web_out=mode=...`):
- `grpcwebtext` (default): base64-encoded, supports unary + server streaming
- `grpcweb`: binary protobuf, unary only

**Import styles** (`import_style=...`): `closure`, `commonjs`, `commonjs+dts` (with `.d.ts`), `typescript` (full TS output — only for `--grpc-web_out`, not `--js_out`).

## Caveats

- **No client-side or bidirectional streaming**: Only unary and server-side streaming. For bidirectional streaming, use the Connect protocol.
- **Server streaming requires `grpcwebtext`**: `mode=grpcweb` (binary) only supports unary calls.
- **Promise clients lose callback access**: `PromiseClient` cannot use `.on('status')` or `.on('metadata')` — use callback-style client if you need those.
- **Proxy is mandatory**: Browsers cannot directly call gRPC backends. You must deploy Envoy (or nginx with grpc-web module, Apache APISIX, or the Go gRPC-Web proxy).
- **TypeScript output quirks**: Never use `import_style=typescript` for `--js_out` — it silently ignores it. Use `--js_out=import_style=commonjs` and let `--grpc-web_out` handle TypeScript generation.
- **CORS**: Add CORS headers on the proxy for cross-origin requests.

## Composition Hints

- Pair with **grpc-services** skill for service definition patterns (unary, streaming RPC types).
- Pair with **grpc-proto3** skill for protobuf message design.
- Use **grpc-interceptors** skill patterns — gRPC-Web supports custom `UnaryInterceptor` and `StreamInterceptor` for auth, retries, logging.
- For production, deploy Envoy with TLS termination and the `envoy.grpc_web` filter. See **grpc-production** for keepalive and retry configuration on the backend side.
