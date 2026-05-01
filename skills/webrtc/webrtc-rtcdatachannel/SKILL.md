---
name: webrtc-rtcdatachannel
description: Bidirectional peer-to-peer arbitrary data transfer via RTCDataChannel in WebRTC
tech_stack: [web]
language: [javascript]
capability: [realtime-messaging, websocket]
version: "WebRTC unversioned"
collected_at: 2026-02-13
---

# RTCDataChannel

> Source: MDN RTCDataChannel API reference, MDN Using WebRTC data channels guide, Google Developers WebRTC data channels guide

## Purpose
`RTCDataChannel` provides a bidirectional, encrypted, peer-to-peer channel for
sending arbitrary data (text, binary, files, game state) between two browsers
without a server intermediary. It rides on top of an `RTCPeerConnection` and
uses SCTP over DTLS for transport — the same security model as HTTPS.

## When to Use
- Low-latency text/binary messaging alongside audio/video tracks in a call
- Peer-to-peer file transfer without uploading to a server
- Real-time game state or collaborative-app data sync
- Any serverless, encrypted data exchange between two user agents

## Basic Usage

**Creator (caller) — automatic negotiation (most common):**
```js
const pc = new RTCPeerConnection();
const dc = pc.createDataChannel("chat");

dc.onopen = () => console.log("open");
dc.onmessage = (e) => console.log("received:", e.data);
dc.onclose = () => console.log("closed");

dc.send("hello!");
```

**Receiver (callee) — listen for incoming channel:**
```js
pc.addEventListener("datachannel", (event) => {
  const dc = event.channel;
  dc.onmessage = (e) => console.log("received:", e.data);
  dc.send("got it!");
});
```

**Manual negotiation** (both sides use same `id` with `negotiated: true`):
```js
const dc = pc.createDataChannel("custom", { negotiated: true, id: 42 });
dc.onopen = () => dc.send("manual channel ready");
// Both peers must create a channel with the same id.
```

## Key APIs (Summary)

| API | Notes |
|---|---|
| `pc.createDataChannel(label, options?)` | Returns `RTCDataChannel`. Options: `negotiated`, `id`, `ordered`, `protocol`, `priority`, `maxPacketLifeTime`/`maxRetransmits`. |
| `dc.send(data)` | Accepts `string`, `Blob`, `ArrayBuffer`, `ArrayBufferView`. |
| `dc.close()` | Either peer may initiate close. |
| `dc.readyState` | `"connecting"` → `"open"` → `"closing"` → `"closed"`. |
| `dc.bufferedAmount` | Bytes queued. Use with `bufferedAmountLowThreshold` + `bufferedamountlow` event for backpressure. |
| `dc.binaryType` | `"arraybuffer"` (default) or `"blob"`. |
| Event: `open` | Channel usable. |
| Event: `message` | Data received in `event.data`. |
| Event: `close` / `closing` | Teardown lifecycle. |
| Event: `error` | Transport error. |

## Caveats
- **Message size**: Keep messages reasonably small (~256 KB or less). Large
  messages cause **head-of-line blocking** without message interleaving (RFC
  8260). Default SCTP message limit is 64 KB unless `max-message-size` SDP
  attribute is negotiated (RFC 8841).
- **Buffering is opaque**: No direct buffer size control. Monitor
  `bufferedAmount` and use `bufferedAmountLowThreshold` for flow control.
- **65,534 channel theoretical limit** per peer connection; actual browser
  limits are lower.
- **Manual-negotiation channels** require out-of-band signaling so both peers
  create matching `id`s with `negotiated: true`.
- **DTLS encryption is mandatory** — data never touches a server, but
  signaling (SDP exchange) still needs your own channel.

## Composition Hints
- Requires an established `RTCPeerConnection` with completed SDP
  offer/answer and ICE candidate exchange (see `webrtc-sdp-negotiation`).
- Data channels can coexist with audio/video tracks on the same peer
  connection — no separate ICE negotiation needed.
- For server-side counterparts or relay, pair with `webrtc-server` patterns
  (TURN/SFU).
- On mobile, see `webrtc-mobile` for platform-specific channel behavior.
