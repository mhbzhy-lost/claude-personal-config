---
name: webrtc-mediasoup
description: Node.js SFU server for WebRTC — Worker/Router/Transport/Producer/Consumer API for multiparty conferencing with per-stream control.
tech_stack: [backend]
language: [typescript, javascript]
capability: [realtime-messaging, media-processing]
version: "mediasoup v3"
collected_at: 2025-01-27
---

# mediasoup

> Source: https://mediasoup.org/documentation/v3/mediasoup/api/, https://github.com/versatica/mediasoup/blob/v3/README.md, https://mediasoup.org/documentation/v3/

## Purpose

mediasoup is a WebRTC SFU (Selective Forwarding Unit) — a C++ media worker controlled by a Node.js TypeScript module. It forwards media streams between participants in a multiparty call without mixing or transcoding. Each stream can be selectively forwarded per-receiver (simulcast/SVC layer selection), giving the application full control over who receives what.

Architecture: one C++ subprocess per CPU core (`Worker`), each hosting multiple `Router` instances. Routers create `Transport` endpoints (WebRTC, plain RTP, pipe, direct), which spawn `Producer`/`Consumer` pairs for media and `DataProducer`/`DataConsumer` for DataChannel messages.

## When to Use

- **Group video calls** — SFU topology scales better than mesh; each participant sends once, server forwards to N receivers.
- **Live streaming with recording** — DirectTransport gives Node.js access to raw RTP for server-side recording/processing.
- **Custom media pipelines** — PipeTransport chains Routers together within the same host for modular topologies.
- **Per-client stream selection** — simulcast/SVC lets each receiver get an appropriate quality layer based on bandwidth or UI.
- mediasoup does **NOT** handle signaling. You must build your own protocol for client↔server SDP exchange, ICE candidate relay, and room management.

## Basic Usage

### Minimal SFU Server

```ts
import * as mediasoup from 'mediasoup';

// 1. Create a worker (C++ subprocess, one per core in production)
const worker = await mediasoup.createWorker({
  logLevel: 'warn',
  rtcMinPort: 10000,
  rtcMaxPort: 59999,
});

// 2. Create a router with supported codecs
const router = await worker.createRouter({
  mediaCodecs: [
    { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
    { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
    { kind: 'video', mimeType: 'video/H264', clockRate: 90000,
      parameters: { 'packetization-mode': 1, 'profile-level-id': '42e01f' } },
  ],
});

// 3. Create a WebRTC transport for a client (send router.rtpCapabilities to client for device.load())
const transport = await router.createWebRtcTransport({
  listenIps: [{ ip: '0.0.0.0', announcedIp: '1.2.3.4' }],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
});

// 4. Client connects by providing its DTLS parameters
await transport.connect({ dtlsParameters: clientDtlsParams });

// 5. Client produces media (sends to server)
const producer = await transport.produce({
  kind: 'audio',
  rtpParameters: clientRtpParams,
});

// 6. Another client consumes (receives from server)
const consumer = await transport2.consume({
  producerId: producer.id,
  rtpCapabilities: client2RtpCapabilities,
});

// 7. For simulcast: client can switch layers
await consumer.setPreferredLayers({ spatialLayer: 1, temporalLayer: 2 });

// 8. Tear down
consumer.close();
producer.close();
transport.close();
router.close();
worker.close();
```

### Multi-Core Scaling

```ts
const numCores = 4; // or os.cpus().length
const workers = await Promise.all(
  Array(numCores).fill(null).map(() => mediasoup.createWorker())
);
// Distribute Routers across workers (e.g., round-robin by room ID)
function getWorkerForRoom(roomId: string) {
  return workers[hash(roomId) % workers.length];
}
```

### Inter-Router Piping

```ts
// Pipe a producer from one Router to another (same host, efficient — no ICE/DTLS)
const pipeTransport = await router1.createPipeTransport({
  listenIp: { ip: '127.0.0.1' },
});
const pipeTransport2 = await router2.createPipeTransport({
  listenIp: { ip: '127.0.0.1' },
});
await pipeTransport2.connect({ ip: '127.0.0.1', port: pipeTransport.tuple.localPort });
await pipeTransport2.consume({ producerId: sourceProducer.id, rtpCapabilities });
```

## Key APIs (Summary)

### Core Hierarchy

| Entity | Creates | Key Method |
|---|---|---|
| `mediasoup` (module) | `Worker` | `createWorker(settings)` |
| `Worker` | `Router` | `createRouter({ mediaCodecs })` |
| `Router` | `Transport` | `createWebRtcTransport(opts)` |
| `Transport` | `Producer`, `Consumer` | `produce(opts)`, `consume(opts)` |
| `Producer` | — | `pause()`, `resume()` |
| `Consumer` | — | `pause()`, `resume()`, `setPreferredLayers()` |

### Transport Types

| Type | Use Case | Connect Method |
|---|---|---|
| `WebRtcTransport` | Browser/mobile clients via ICE+DTLS | `connect({ dtlsParameters })` |
| `PlainTransport` | Bare RTP/SRTP without ICE/DTLS | `connect({ ip, port, rtcpPort?, srtpParameters? })` |
| `PipeTransport` | Inter-Router piping (same host) | `connect({ ip, port })` |
| `DirectTransport` | Node.js-side RTP injection/access | `connect()` + `sendRtcp()` / `"rtcp"` event |

### Producer / Consumer Lifecycle

```
Client connects → Transport.produce() → Producer (server receives media)
Client subscribes → Transport.consume({ producerId }) → Consumer (server forwards)
```

- `producer.kind` — `"audio"` | `"video"`
- `producer.type` — `"simple"` | `"simulcast"` | `"svc"` (check before `setPreferredLayers`)
- `consumer.priority` — influence server bandwidth allocation among consumers
- `consumer.requestKeyFrame()` — request a key frame from the producer (useful on subscription)

### Observer Pattern

Every entity has an `.observer` EventEmitter for monitoring without affecting operation:

```ts
router.observer.on('newtransport', (t) => { /* log */ });
transport.observer.on('newproducer', (p) => { /* notify room */ });
producer.observer.on('score', (scores) => { /* track quality */ });
```

### DataChannel (SCTP)

WebRtcTransport provides `sctpParameters` when SCTP is enabled. Clients create `DataProducer`/`DataConsumer` pairs:

```ts
const dataProducer = await transport.produceData({ label: 'chat', protocol: '' });
dataProducer.on('message', (msg) => { /* from client */ });
dataProducer.send('hello'); // server → client
```

## Caveats

- **No signaling**: You must implement your own signaling layer. mediasoup only provides media-plane APIs — no WebSocket/HTTP signaling, no room management, no SDP exchange protocol.
- **Single-threaded Worker**: Each C++ worker runs in one CPU core. Scale by creating N workers (one per core) and mapping Routers to them. Do not create multiple Routers in one Worker expecting parallelism.
- **ICE Lite**: Server is always `"controlled"` role. Client must be the controlling ICE agent. The `iceRole` property is read-only.
- **Port planning**: Each WebRtcTransport needs at least 1 UDP port. With multiple listen IPs and TCP/UDP, ports multiply. Use `WebRtcServer` (shared listener) to reduce port usage across transports.
- **router.rtpCapabilities** is what you send to `device.load()` on the client. `mediasoup.getSupportedRtpCapabilities()` is the static set — do NOT use it for client loading.
- **DirectTransport RTP**: You must construct proper RTP packet headers yourself when injecting — mediasoup does not generate them.
- **DTLS certificates**: Auto-generated by default. In production with multiple workers, pre-generate and share certificates to avoid startup overhead.

## Composition Hints

- This skill covers the **server-side SFU**. Pair with `webrtc-sdp-negotiation` and `webrtc-ice-connection` to understand the client-side signaling flow that feeds into `transport.connect()` and `transport.produce()`.
- `webrtc-rtcpeerconnection` covers the browser client API that mediasoup-client wraps — understanding the browser-side helps debug DTLS/ICE issues.
- For TURN/STUN server configuration on the client side (not mediasoup itself), see `webrtc-coturn`. mediasoup is the SFU; coturn provides NAT traversal for clients reaching it.
- For an alternative server architecture (plugin-based gateway vs. SFU), see `webrtc-janus-gateway`.
- The `mediasoup-client` library (browser/Node.js) is the client counterpart and handles `device.load()` with `router.rtpCapabilities`.
