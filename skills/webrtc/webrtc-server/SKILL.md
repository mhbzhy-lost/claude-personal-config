---
name: webrtc-server
description: Server-side WebRTC infrastructure — SFU/MCU (Janus, mediasoup), TURN/STUN relay (coturn), and the TURN protocol (RFC 8656).
tech_stack: [backend, media-processing]
language: [c, cpp, javascript, nodejs]
capability: [media-processing, realtime-messaging]
version: "Janus multistream, mediasoup v3, TURN RFC 8656, coturn 4.x"
collected_at: 2026-03-16
---

# WebRTC Server Infrastructure

> Source: https://janus.conf.meetecho.com/docs/, https://mediasoup.org/documentation/v3/, https://www.rfc-editor.org/rfc/rfc8656, https://github.com/coturn/coturn

## Purpose

Server-side WebRTC infrastructure falls into three categories:

1. **SFU (Selective Forwarding Unit)** — receives media streams from participants and selectively forwards them to others without decoding/encoding. mediasoup and Janus are the two dominant open-source SFUs.
2. **TURN/STUN servers** — relay traffic between peers when direct P2P connections fail due to NAT/firewall restrictions. coturn is the standard deployment.
3. **TURN protocol (RFC 8656)** — the wire protocol for clients to request, manage, and use relayed transport addresses on a TURN server.

## When to Use

| Scenario | Solution |
|---|---|
| Multi-party video/audio conferencing | mediasoup (low-level C++ SFU, Node.js API) or Janus (plugin-based, C core) |
| NAT traversal fallback for P2P calls | Deploy coturn as TURN server; ICE uses it as last-resort candidate |
| UDP blocked by enterprise firewall | Use TURN over TCP/TLS (coturn supports both) |
| Hide participant IPs (location privacy) | Route media through TURN relay; only relayed candidates shared with peer |
| Multi-tenant TURN with ephemeral credentials | coturn REST API with time-limited shared-secret auth |
| SIP gateway / conference bridge / recording | Janus plugins (echo test, SIP gateway, conference bridge, recorder) |

## Basic Usage

### coturn — TURN/STUN Server Deployment

```bash
# Install (Debian/Ubuntu)
apt install coturn

# Run with defaults
turnserver --log-file stdout

# Docker (typical ports)
docker run -d \
  -p 3478:3478 -p 3478:3478/udp \
  -p 5349:5349 -p 5349:5349/udp \
  -p 49152-65535:49152-65535/udp \
  coturn/coturn
```

**Key ports:** 3478 (STUN/TURN), 5349 (TURN+TLS), 49152-65535 (relay port range).

**Authentication modes:**
- **Long-term credentials** — static username/password per client
- **TURN REST API** — shared secret between TURN server and app server; app generates short-lived credentials so browser clients never see the long-term secret. This is the standard pattern for WebRTC applications.
- **oAuth** — experimental third-party authorization

**Build from source (when apt package insufficient):**
```bash
git clone git@github.com:coturn/coturn.git && cd coturn
./configure && make
```
Required: `libevent2`. Optional: OpenSSL (TLS/DTLS), database connectors (SQLite, MySQL, PostgreSQL, Redis, MongoDB for user storage), Prometheus client library.

### mediasoup — SFU Architecture

mediasoup's core abstraction model:

```
Router  ──┬── Transport (WebRTC) ── Producer (video/audio from client)
          │                         └─ Consumer (media sent to client)
          ├── Transport (plain RTP)
          └── Transport (...)
```

- **Router** — top-level SFU unit; each conference room typically gets one Router
- **Transport** — connection endpoint (WebRTC, plain RTP); each participant connects via a Transport
- **Producer** — media source; a client publishing video creates a Producer on its Transport
- **Consumer** — media sink; to receive another participant's media, create a Consumer on the receiving Transport

The SFU forwards media between Producers and Consumers without transcoding. Codec negotiation happens via RTP Parameters and Capabilities. DataChannel is supported through SCTP Parameters.

**Ecosystem:**
- `mediasoup` (Node.js) — server-side module
- `mediasoup-client` — browser/Node.js client library, also supports React Native
- `libmediasoupclient` — C++ client built on libwebrtc
- `mediasoup-client-aiortc` — Python handler for aiortc
- `mediasoup-rust` — Rust port of the C++ SFU

### Janus — Plugin-Based WebRTC Gateway

Janus is a C-based general-purpose WebRTC server. It handles the WebRTC transport layer (ICE, DTLS, SDP negotiation) and exposes a **plugin API** for application logic. The server itself does nothing without plugins.

**Architecture:**
```
Janus Core ──┬── Plugin (EchoTest)
             ├── Plugin (Conference Bridge)
             ├── Plugin (SIP Gateway)
             ├── Plugin (VideoRoom)
             ├── Plugin (Recorder/Player)
             └── ...
       Transport Layer (HTTP/WS, REST, RabbitMQ, MQTT, UnixSockets)
```

**Transport protocols** for client-server communication: JavaScript API (HTTP/WebSocket), RESTful API, WebSockets, RabbitMQ, MQTT, Nanomsg, UnixSockets.

**Key APIs:**
- **Admin/Monitor API** — query session counts, bandwidth, plugin state
- **Event Handler API** — hook into session/plugin lifecycle events
- **Logger API** — pluggable logging backends
- **Recordings** — built-in support for recording media streams

Janus uses JSON for all client-server messaging. Each client attaches to a plugin via a "handle"; the plugin processes messages and relays media.

## Key APIs (Summary)

### TURN Protocol (RFC 8656) — Core Methods

| Method | Direction | Purpose |
|---|---|---|
| **Allocate** | Client→Server | Request a relayed transport address. Returns relayed address + lifetime. |
| **Refresh** | Client→Server | Renew an allocation before expiry. Can also update the 5-tuple. |
| **CreatePermission** | Client→Server | Authorize a peer IP+protocol to send data to the relayed address. |
| **ChannelBind** | Client→Server | Bind a channel number (0x4000–0x7FFF) to a peer for bandwidth-efficient ChannelData messages. |
| **Send** | Client→Server | Relay application data to a peer. Contains XOR-PEER-ADDRESS + DATA. |
| **Data** | Server→Client | Wraps data received from a peer. Contains XOR-PEER-ADDRESS + DATA. |
| **ChannelData** | Bidirectional | 4-byte channel number + length + data. Avoids STUN header overhead. |

**Critical protocol details:**
- Allocations are identified by the **5-tuple**: (client IP, client port, server IP, server port, transport protocol)
- Permissions are **IP+protocol only** (no port restriction). Client must install a permission before a peer can send.
- TURN server always uses **UDP to peers**, regardless of client↔server transport.
- Allocations expire unless refreshed; default lifetime is 600 seconds.

### mediasoup — Key Server API

```
worker.createRouter(...)           → Router
router.createWebRtcTransport(...) → WebRtcTransport
transport.createProducer(...)     → Producer
transport.createConsumer(...)     → Consumer
```

### coturn — Configuration Essentials

```
listening-port=3478
tls-listening-port=5349
min-port=49152
max-port=65535
user=demo:password123
realm=example.com
# REST API auth (shared secret)
use-auth-secret
static-auth-secret=your-shared-secret
```

## Caveats

- **TURN is expensive**: Every relayed byte goes through your server. A single HD video stream is ~1-4 Mbps. Use TURN only as ICE fallback — ICE will try direct P2P (host candidates, server-reflexive via STUN) first.
- **TURN↔peer is always UDP**: Even when the client connects to coturn over TCP/TLS, the server relays to peers over UDP only (per RFC 8656). If a peer is behind a UDP-blocking firewall, TURN cannot help for that direction.
- **Janus is a framework, not a product**: The out-of-box plugins (EchoTest, VideoRoom, SIP Gateway) are reference implementations. Production use requires writing or customizing plugins.
- **mediasoup requires application logic**: It's a low-level SFU — no built-in signaling, room management, or authentication. You build these on top.
- **Allocation leaks**: TURN allocations have a finite lifetime (default 600s). Clients that disconnect without sending a Refresh with lifetime=0 leave orphaned allocations consuming server resources until timeout.
- **permission-first model**: A TURN server silently drops packets from peers that don't match an installed permission (IP+protocol). Install permissions before signaling the relayed address to peers.
- **coturn scaling**: Single instance handles thousands of TURN calls per CPU. For horizontal scaling use DNS SRV load balancing and/or the ALTERNATE-SERVER (300) mechanism. TURN is stateful — the same allocation cannot be served by multiple servers.

## Composition Hints

- **Signaling + TURN**: Your signaling server (WebSocket/long-poll) tells the client which TURN server to use and provides ephemeral credentials (via the REST API pattern). The client then talks directly to coturn for media relay — signaling server is not in the media path.
- **SFU + TURN**: In production, run SFU (mediasoup/Janus) on a public IP so clients connect directly. If clients are behind restrictive NATs, provide coturn as a backup TURN candidate.
- **Janus Plugin Pattern**: Each plugin runs in-process in the Janus C core. A plugin receives JSON messages from clients via Janus and can manipulate RTP/RTCP streams. Use the VideoRoom plugin as a reference for building multi-party conferencing.
- **mediasoup Router-per-Room**: Create one Router per conference room. Each participant gets a WebRtcTransport. Publishing participants create Producers; subscribing participants create Consumers from other participants' Producers. Use `router.canConsume()` to check codec compatibility before creating a Consumer.
- **Monitoring**: coturn exposes Prometheus metrics. mediasoup provides RTC Statistics per Producer/Consumer. Janus has an Admin/Monitor API (JSON over HTTP or Unix socket).
