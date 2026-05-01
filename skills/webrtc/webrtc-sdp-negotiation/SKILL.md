---
name: webrtc-sdp-negotiation
description: WebRTC SDP offer/answer negotiation and ICE candidate exchange for establishing peer connections
tech_stack: [web]
language: [javascript]
capability: [websocket, realtime-messaging]
version: "WebRTC unversioned"
collected_at: 2025-11-10
---

# SDP Negotiation & ICE

> Source: MDN Introduction to WebRTC protocols, Google Developers Getting started with peer connections, MDN RTCPeerConnection.setLocalDescription()

## Purpose
This is the core handshake that establishes a WebRTC peer-to-peer connection.
It covers the **SDP offer/answer exchange** (what media/codecs each peer
supports) and **ICE candidate gathering** (how to route around NATs/firewalls).
Signaling — the channel for exchanging this metadata — is **not** defined by
WebRTC and must be implemented separately (WebSocket, REST, etc.).

## When to Use
- Setting up any WebRTC `RTCPeerConnection` between two endpoints
- Implementing the offer/answer lifecycle (including renegotiation for
  adding/removing tracks mid-session)
- Configuring ICE servers (STUN/TURN) for NAT traversal
- Debugging connection failures or SDP mismatches

## Basic Usage

### Calling peer (initiates):
```js
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

// Trickle ICE: send candidates as they arrive
pc.addEventListener('icecandidate', e => {
  if (e.candidate) signaling.send({ ice: e.candidate });
});

// Listen for answer
signaling.on('message', async msg => {
  if (msg.answer) await pc.setRemoteDescription(msg.answer);
  if (msg.ice) await pc.addIceCandidate(msg.ice);
});

// Create and send offer
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
signaling.send({ offer });
```

### Receiving peer (answers):
```js
const pc = new RTCPeerConnection({ iceServers: [...] });

pc.addEventListener('icecandidate', e => {
  if (e.candidate) signaling.send({ ice: e.candidate });
});

signaling.on('message', async msg => {
  if (msg.offer) {
    await pc.setRemoteDescription(msg.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signaling.send({ answer });
  }
  if (msg.ice) await pc.addIceCandidate(msg.ice);
});
```

### Detect connection:
```js
pc.addEventListener('connectionstatechange', () => {
  if (pc.connectionState === 'connected') console.log('connected!');
});
```

### Renegotiation (implicit — preferred):
```js
pc.addEventListener('negotiationneeded', async () => {
  await pc.setLocalDescription(); // auto-creates offer/answer
  signaling.send({ description: pc.localDescription });
});
```

## Key APIs (Summary)

| API | Role |
|---|---|
| `pc.createOffer()` | Generate local SDP offer. |
| `pc.createAnswer()` | Generate local SDP answer in response to remote offer. |
| `pc.setLocalDescription(desc)` | Apply offer or answer locally. Parameterless form auto-creates based on signaling state. |
| `pc.setRemoteDescription(desc)` | Apply remote peer's offer or answer. |
| `pc.addIceCandidate(candidate)` | Feed remote ICE candidates into the connection. |
| `pc.icecandidate` event | Fires per discovered local ICE candidate — send to remote peer (trickle). |
| `pc.connectionState` | `"new"` → `"connecting"` → `"connected"` / `"disconnected"` / `"failed"` / `"closed"`. |
| `pc.signalingState` | `"stable"`, `"have-local-offer"`, `"have-remote-offer"`, `"have-local-pranswer"`, `"have-remote-pranswer"`, `"closed"`. |

## Caveats
- **Signaling is your problem**: WebRTC provides no signaling transport. You
  must build your own (WebSocket, REST, Firebase, etc.) to relay SDP and ICE
  candidates.
- **Always use trickle ICE**: Sending candidates one-by-one as they're
  discovered (`icecandidate` event) dramatically reduces connection setup
  latency vs. waiting for gathering to complete.
- **Symmetric NAT needs TURN**: STUN alone fails behind Symmetric NAT. Always
  include TURN server URLs in production `iceServers` config.
- **setLocalDescription() is async and deferred**: The new description does
  not take effect until both peers agree. During renegotiation the existing
  configuration stays active.
- **Deprecated callback form**: `setLocalDescription(desc, onSuccess,
  onError)` is deprecated — use only the Promise form.
- **SDP is not a protocol**: It's a data format (RFC 8866). Lines are
  `type=value`; `m=` lines describe media sections. Don't parse it manually
  unless debugging.
- **Multi-party needs SFU**: For group calls, use a Selective Forwarding Unit
  with simulcast or SVC. Chrome 111+ supports SVC; Firefox (as of 136) does
  not. VP8 = temporal layers only; VP9 = temporal + spatial.

## Composition Hints
- Every `RTCPeerConnection` setup (see `webrtc-rtcpeerconnection`) depends on
  this negotiation flow.
- `RTCDataChannel` (see `webrtc-rtcdatachannel`) rides on the same peer
  connection and uses the same ICE transport — no separate negotiation needed.
- Media capture (`webrtc-mediastream-getusermedia`) provides tracks that are
  added to the peer connection before or during negotiation.
- Server-side relays (TURN/SFU) are covered in `webrtc-server`.
- Mobile-specific ICE and network-handover behavior is in `webrtc-mobile`.
