---
name: grpc-production
description: Production operations for gRPC: TLS/mTLS auth, keepalive, retry/hedging policies, service config, and xDS service mesh integration.
tech_stack: [backend]
capability: [auth, rpc, observability]
version: "gRPC unversioned"
collected_at: 2025-06-01
---

# gRPC Production Operations

> Source: https://grpc.io/docs/guides/auth/, https://grpc.io/docs/guides/keepalive/, https://grpc.io/docs/guides/retry/, https://grpc.io/docs/guides/request-hedging/, https://grpc.io/docs/guides/service-config/, https://grpc.github.io/grpc/core/md_doc_grpc_xds_features.html

## Purpose

Comprehensive guide for running gRPC in production. Covers the six pillars of production readiness: authentication (TLS/mTLS/custom), connection keepalive, retry and hedging policies for resilience, centralized service config, and xDS service mesh integration.

## When to Use

- Securing gRPC with TLS or mTLS
- Keeping long-lived streaming connections alive behind LBs/NATs
- Adding automatic retry or hedging to reduce tail latency
- Distributing client-side configuration (timeouts, LB policy) to all clients
- Integrating gRPC services into an Envoy/Istio service mesh via xDS

## Basic Usage

### Authentication: SSL/TLS

The simplest production setup — client authenticates the server and encrypts all traffic:

```go
// Go
creds, _ := credentials.NewClientTLSFromFile("ca.pem", "")
conn, _ := grpc.Dial("myservice.example.com", grpc.WithTransportCredentials(creds))
```

```js
// Node.js
const ssl_creds = grpc.credentials.createSsl(fs.readFileSync('ca.pem'));
const stub = new helloworld.Greeter('myservice.example.com', ssl_creds);
```

For **mTLS**, set the client certificate in `SslCredentialsOptions` (C++) or equivalent in each language. On Windows, root certificates must be specified explicitly — there are no default POSIX paths.

### Custom Auth (Metadata Plugin)

Inject arbitrary headers (JWT, API keys, etc.) per call:

```js
// Node.js — metadata generator
const metaCallback = (_params, callback) => {
  const meta = new grpc.Metadata();
  meta.add('authorization', 'Bearer ' + token);
  callback(null, meta);
};
const callCreds = grpc.credentials.createFromMetadataGenerator(metaCallback);
const combCreds = grpc.credentials.combineChannelCredentials(sslCreds, callCreds);
```

```cpp
// C++ — MetadataCredentialsPlugin
class MyAuth : public grpc::MetadataCredentialsPlugin {
  grpc::Status GetMetadata(..., std::multimap<string, string>* metadata) override {
    metadata->insert({"authorization", "Bearer " + token_});
    return grpc::Status::OK;
  }
};
```

### Keepalive: Server-Side Configuration

For production servers behind load balancers, the critical settings are:

```go
// Go server keepalive
ka := keepalive.ServerParameters{
    MaxConnectionIdle:     15 * time.Minute,  // close idle connections
    MaxConnectionAge:      30 * time.Minute,  // force rotation
    MaxConnectionAgeGrace: 5 * time.Minute,   // grace for in-flight RPCs
    Time:                  2 * time.Minute,   // ping interval
    Timeout:               20 * time.Second,  // ping ack timeout
}
```

Key rules:
- `KEEPALIVE_TIME` defaults to **2 hours** on servers (disabled on clients)
- `KEEPALIVE_TIMEOUT` defaults to **20 seconds**
- Never enable `KEEPALIVE_WITHOUT_CALLS` on clients without server coordination
- Keep intervals ≥ 1 minute to avoid being treated as a DoS
- If the server doesn't support keepalive, it eventually sends `GOAWAY` with `too_many_pings`

### Retry Policy (Service Config)

Configured via JSON service config, per-method:

```json
{
  "methodConfig": [{
    "name": [{"service": "myservice.MyService"}],
    "retryPolicy": {
      "maxAttempts": 4,
      "initialBackoff": "0.1s",
      "maxBackoff": "1s",
      "backoffMultiplier": 2,
      "retryableStatusCodes": ["UNAVAILABLE"]
    }
  }]
}
```

±20% jitter is automatically applied to backoff. **Critical rule**: once the response *header* is received, the RPC is committed — no further retries. Only retry **idempotent** operations.

### Hedging Policy (Tail Latency)

Send parallel requests to multiple backends, use the first response:

```json
{
  "methodConfig": [{
    "name": [{"service": "myservice.MyService"}],
    "hedgingPolicy": {
      "maxAttempts": 3,
      "hedgingDelay": "0.5s",
      "nonFatalStatusCodes": ["UNAVAILABLE", "INTERNAL"]
    }
  }]
}
```

`maxAttempts` is capped at 5. If `hedgingDelay` is omitted, all requests fire simultaneously. Non-fatal status codes cause the next hedged request to fire *immediately* (shortcutting the delay).

### Retry/Hedging Throttling

Prevents retry storms from overloading servers:

```json
{
  "retryThrottling": {
    "maxTokens": 10,
    "tokenRatio": 0.1
  }
}
```

Token bucket: failed RPC → `-1 token`, successful RPC → `+tokenRatio`. Retries/hedges are paused when `token_count ≤ maxTokens/2`.

### Service Config (Full Example)

```json
{
  "loadBalancingConfig": [{"round_robin": {}}],
  "methodConfig": [
    {
      "name": [{}],
      "timeout": "1s"
    },
    {
      "name": [
        {"service": "foo", "method": "bar"},
        {"service": "baz"}
      ],
      "timeout": "2s"
    }
  ]
}
```

Service config is per-target (hostname), not global. Acquired via DNS TXT records, xDS, or programmatically via client API.

## Key APIs (Summary)

| Area | Key Knobs |
|---|---|
| **Auth** | `SslCredentials`, `GoogleDefaultCredentials`, `MetadataCredentialsPlugin`, `CompositeChannelCredentials` |
| **Keepalive** | `KEEPALIVE_TIME`, `KEEPALIVE_TIMEOUT`, `MAX_CONNECTION_IDLE`, `MAX_CONNECTION_AGE`, `MAX_CONNECTION_AGE_GRACE` |
| **Retry** | `maxAttempts`, `initialBackoff`, `maxBackoff`, `backoffMultiplier`, `retryableStatusCodes` |
| **Hedging** | `maxAttempts` (≤5), `hedgingDelay`, `nonFatalStatusCodes` |
| **Throttling** | `maxTokens`, `tokenRatio` |
| **Service Config** | `loadBalancingConfig`, `methodConfig[].timeout`, `methodConfig[].retryPolicy`, `methodConfig[].hedgingPolicy` |
| **Server Pushback** | Metadata key `grpc-retry-pushback-ms` (signed 32-bit int, ms) |

## Caveats

- **Retry only idempotent RPCs**: A retried RPC may execute multiple times on the server. Once response headers arrive, the RPC is committed — no further retries.
- **Hedging amplifies load**: `maxAttempts=5` means up to 5× server load. Always pair with throttling.
- **Keepalive requires coordination**: Client keepalive settings must be accepted by the server. Unapproved keepalive triggers `GOAWAY` with `too_many_pings`.
- **Keepalive intervals < 1 minute** risk being treated as DoS. Never enable `KEEPALIVE_WITHOUT_CALLS` without server opt-in.
- **Google credentials are Google-only**: Never send Google-issued OAuth2 tokens to non-Google services — token theft risk.
- **xDS silently ignores unsupported config**: No log warning. Verify all clients support the features you configure.
- **xDS LB policy NACK is global**: One unsupported policy in a cluster rejects ALL resources in that xDS response.
- **ALTS is GCP-only**: Application Layer Transport Security only works on GCE/GKE.
- **Service Config is per-target**: `myservice.example.com` config does not apply to `otherservice.example.com`.
- **Transparent retry still happens**: Even without a retry policy, gRPC may transparently retry once if the RPC reached the server library but not the application logic.

## Composition Hints

- Pair with **grpc-interceptors** for auth interceptor patterns (JWT validation, rate limiting) implemented server-side.
- Pair with **grpc-go** / **grpc-python** / **grpc-nodejs** for language-specific keepalive and credentials APIs.
- Use **grpc-services** skill for understanding which RPC types are safe to retry (unary vs streaming idempotency).
- For service mesh deployments, pair with **kubernetes** and Istio/Envoy skills for xDS control plane integration.
