---
name: grpc-nodejs
description: Node.js gRPC with @grpc/grpc-js — dynamic/static codegen, all four RPC types, streaming via Readable/Writable/Duplex, and package ecosystem (@grpc/proto-loader, grpc-tools, @grpc/reflection, grpc-health-check)
tech_stack: [rpc]
language: [javascript, typescript]
capability: [rpc, api-design]
version: "@grpc/grpc-js unversioned"
collected_at: 2025-01-27
---

# gRPC Node.js (@grpc/grpc-js)

> Source: https://grpc.io/docs/languages/node/basics/, https://grpc.io/docs/languages/node/quickstart/, https://github.com/grpc/grpc-node

## Purpose

gRPC Node.js provides the JavaScript/TypeScript implementation of gRPC via `@grpc/grpc-js` — a pure-JavaScript client and server with no C++ addon. It supports both dynamic code generation (loading `.proto` files at runtime via `@grpc/proto-loader`) and static code generation (via `grpc-tools` / `protoc` plugin). All four RPC types are supported, with streaming implemented through Node.js `Readable`/`Writable`/`Duplex` stream interfaces.

## When to Use

- gRPC in Node.js backends and microservices (use `@grpc/grpc-js`, not the deprecated `grpc` native package)
- Dynamic `.proto` loading at runtime — no build step needed
- Static codegen for production — TypeScript types, no runtime parsing overhead
- Server reflection API (`@grpc/reflection`) for tools like grpcurl
- Health checking protocol (`grpc-health-check`) for Kubernetes/load-balancer probes

## Basic Usage

### Installation

```bash
npm install @grpc/grpc-js @grpc/proto-loader
# Optional: static codegen
npm install grpc-tools
# Optional: reflection + health
npm install @grpc/reflection grpc-health-check
```

### Dynamic Codegen: Load .proto at Runtime

```js
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const packageDefinition = protoLoader.loadSync('helloworld.proto', {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});
const hello_proto = grpc.loadPackageDefinition(packageDefinition).helloworld;
```

### Server (all 4 RPC types)

```js
const server = new grpc.Server();

// Unary: (call, callback) → callback(null, response)
function getFeature(call, callback) {
    callback(null, { name: 'Eiffel Tower', location: call.request });
}

// Server-streaming: call implements Writable
function listFeatures(call) {
    features.forEach(f => call.write(f));
    call.end();
}

// Client-streaming: call implements Reader
function recordRoute(call, callback) {
    call.on('data', (point) => { /* accumulate */ });
    call.on('end', () => { callback(null, summary); });
}

// Bidirectional: call implements Duplex
function routeChat(call) {
    call.on('data', (note) => { call.write(response); });
    call.on('end', () => { call.end(); });
}

server.addService(routeguide.RouteGuide.service, {
    getFeature, listFeatures, recordRoute, routeChat
});

server.bindAsync('0.0.0.0:50051',
    grpc.ServerCredentials.createInsecure(),
    () => { server.start(); });
```

### Client (all 4 RPC types)

```js
const client = new routeguide.RouteGuide(
    'localhost:50051',
    grpc.credentials.createInsecure()
);

// Unary — callback-based
client.getFeature({ latitude: 409146138, longitude: -746188906 },
    (err, feature) => { /* ... */ });

// Server-streaming — returns Readable
const stream = client.listFeatures(rectangle);
stream.on('data', (feature) => { /* ... */ });
stream.on('end', () => { /* done */ });
stream.on('error', (e) => { /* stream closed with error */ });
stream.on('status', (status) => { /* server status */ });

// Client-streaming — returns Writable, pass callback for response
const call = client.recordRoute((err, stats) => { /* ... */ });
call.write({ latitude: lat, longitude: lng });
call.end();

// Bidirectional — returns Duplex
const chat = client.routeChat();
chat.on('data', (note) => { /* read from server */ });
chat.write({ location: loc, message: msg });
chat.end();
```

### Static Codegen

```bash
npm install grpc-tools
./node_modules/.bin/grpc_tools_node_protoc \
    --js_out=import_style=commonjs,binary:./out \
    --grpc_out=grpc_js:./out \
    --proto_path=./protos \
    ./protos/route_guide.proto
```

## Key APIs (Summary)

### Package Ecosystem

| Package | Purpose | Status |
|---------|---------|--------|
| `@grpc/grpc-js` | Pure-JS client & server | **Recommended** |
| `grpc` | C++ addon-based | Deprecated (Node ≤14 only) |
| `@grpc/proto-loader` | Dynamic `.proto` loading | Used with dynamic codegen |
| `grpc-tools` | `protoc` + gRPC Node plugin | Used with static codegen |
| `@grpc/reflection` | Server reflection API | For grpcurl / tooling |
| `grpc-health-check` | Health checking service | K8s / LB probes |

### Server Handler Signatures by RPC Type

| RPC Type | Handler Signature | `call` Interface | Response Method |
|----------|-------------------|------------------|-----------------|
| Unary | `(call, callback)` | `call.request` | `callback(null, res)` |
| Server-streaming | `(call)` | `Writable` | `call.write(msg)` + `call.end()` |
| Client-streaming | `(call, callback)` | `Reader` (`data`/`end` events) | `callback(null, res)` |
| Bidirectional | `(call)` | `Duplex` | `call.write(msg)` + `call.end()` |

### Client Calling Patterns by RPC Type

| RPC Type | Return Value | How to Consume |
|----------|-------------|----------------|
| Unary | `void` (via callback) | Pass `(err, response)` callback |
| Server-streaming | `Readable` | `on('data')`, `on('end')`, `on('error')`, `on('status')` |
| Client-streaming | `Writable` | `write(msg)`, `end()`, callback in constructor |
| Bidirectional | `Duplex` | `write(msg)`, `end()`, `on('data')` |

### Stream Event Contract

- Only **one** of `'error'` or `'end'` will be emitted
- `'status'` fires separately when the server sends status metadata
- Errors in `'data'` callbacks do **not** close the stream

## Caveats

- **Always use `@grpc/grpc-js`**: The `grpc` (native) package is deprecated and only supports Node ≤14.
- **`bindAsync` is async**: Call `server.start()` inside the callback — not after `bindAsync`.
- **Dynamic vs Static codegen tradeoff**: Dynamic is simpler for dev (no build step). Static is better for production (TypeScript types, no runtime `.proto` parsing). Both are interoperable — a dynamic server works with a static client and vice versa.
- **Error-first callbacks**: Unary and client-streaming RPCs follow Node.js convention: `callback(error, response)` — pass `null` for the error on success.
- **`call.request` is synchronous**: In unary/server-streaming handlers, the request is available immediately; no need to wait for an event.
- **All client methods are async**: Even unary calls don't return a value directly — always use the callback.

## Composition Hints

- **Pair with `grpc-services`**: Understand the 4 RPC type semantics; Node.js stream interfaces map directly to server/client/bidirectional streaming.
- **Pair with `grpc-proto3`**: Write `.proto` files knowing proto3 syntax before loading them with `@grpc/proto-loader`.
- **Pair with `grpc-interceptors`**: The interceptor concept applies; `@grpc/grpc-js` supports interceptors for auth, logging, rate-limiting.
- **Pair with `grpc-web`**: If browser clients need to call your Node.js gRPC server, use the Envoy gRPC-Web proxy in front.
- **Pair with `grpc-production`**: For TLS, use `grpc.ServerCredentials.createSsl()` and `grpc.credentials.createSsl()`. Keepalive and retry config via service config JSON.
- **Server reflection**: Install `@grpc/reflection` and add it to your server for `grpcurl` compatibility — critical for debugging in production.
