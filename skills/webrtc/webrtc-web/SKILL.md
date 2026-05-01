---
name: webrtc-web
description: Browser-side WebRTC APIs — RTCPeerConnection lifecycle, MediaStream/getUserMedia, RTCDataChannel, SDP offer/answer negotiation, and ICE/STUN/TURN protocol fundamentals.
tech_stack: [web]
language: [javascript]
capability: [media-processing, realtime-messaging]
version: "W3C Recommendation 13 March 2025"
collected_at: 2025-01-01
---

# WebRTC (Browser APIs)

> Source: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API, https://www.w3.org/TR/webrtc/, https://webrtc.org/getting-started/overview, https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity

## Purpose

WebRTC enables peer-to-peer real-time audio, video, and arbitrary data exchange between browsers without plugins or intermediary servers (beyond signaling). It is the browser-native stack for video conferencing, screen sharing, and P2P data channels.

## When to Use

- Real-time audio/video calls between browsers (teleconferencing)
- Screen sharing (`getDisplayMedia`)
- P2P file transfer or game state sync via `RTCDataChannel`
- Any browser-to-browser connection requiring NAT traversal

## Basic Usage

**Establishing a call (caller side):**

```js
const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
});

// Capture local media
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
stream.getTracks().forEach(track => pc.addTrack(track, stream));

// Create and set local offer
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);

// Send offer to remote via your signaling channel
signaling.send({ type: "offer", sdp: pc.localDescription });

// ICE candidates trickle asynchronously — send them as they appear
pc.onicecandidate = ({ candidate }) => {
  if (candidate) signaling.send({ type: "ice-candidate", candidate });
};

// Handle incoming remote tracks
pc.ontrack = ({ streams: [remoteStream] }) => {
  remoteVideo.srcObject = remoteStream;
};
```

**Answering side:**

```js
const pc = new RTCPeerConnection({ iceServers: [...] });

// On receiving remote offer:
await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
stream.getTracks().forEach(track => pc.addTrack(track, stream));
const answer = await pc.createAnswer();
await pc.setLocalDescription(answer);
signaling.send({ type: "answer", sdp: pc.localDescription });
```

**DataChannel:**

```js
const dc = pc.createDataChannel("chat");
dc.onopen = () => dc.send("Hello!");
dc.onmessage = ({ data }) => console.log(data);
```

**ICE restart (recover from failed connections):**

```js
const offer = await pc.createOffer({ iceRestart: true });
await pc.setLocalDescription(offer);
```

## Key APIs (Summary)

| API | Role |
|---|---|
| `RTCPeerConnection` | Central peer connection — manages ICE, offer/answer, tracks |
| `RTCDataChannel` | Bidirectional arbitrary data (WebSocket-like API) |
| `MediaDevices.getUserMedia()` | Capture camera/microphone → `MediaStream` |
| `MediaDevices.getDisplayMedia()` | Screen capture → `MediaStream` |
| `RTCSessionDescription` | SDP container with `type` (offer/answer/pranswer/rollback) |
| `RTCIceCandidate` | Network path candidate for NAT traversal |

**Configuration — `RTCConfiguration` keys:**

| Key | Values | Default |
|---|---|---|
| `iceServers` | `[{urls, username?, credential?}]` | `[]` |
| `iceTransportPolicy` | `"all"` \| `"relay"` | `"all"` |
| `bundlePolicy` | `"balanced"` \| `"max-compat"` \| `"max-bundle"` | `"balanced"` |
| `iceCandidatePoolSize` | 0–255 | `0` |

**Signaling state machine (`RTCSignalingState`):**

```
stable → have-local-offer / have-remote-offer → stable (via answer)
       → have-local-pranswer / have-remote-pranswer (intermediate)
       → closed
```

**ICE connection states:** `new` → `checking` → `connected` / `completed` → `disconnected` → `failed` → `closed`

## ICE / STUN / TURN (Protocol Primer)

ICE is the NAT-traversal layer. Peers exchange *candidates* through the signaling channel.

| Candidate Type | Protocol | Meaning |
|---|---|---|
| `host` | UDP | Direct local IP |
| `srflx` | UDP | Server-reflexive (via STUN) — public-side NAT binding |
| `prflx` | UDP | Peer-reflexive — discovered during trickle ICE |
| `relay` | UDP/TCP | Via TURN — media relays through relay server |

- **STUN** — Discovers public IP + NAT type. Lightweight, no media relay. Use `stun:` URIs.
- **TURN** — Relays media when direct P2P fails. Bandwidth-expensive. Use `turn:` / `turns:` URIs with credentials.
- **Trickle ICE** — Send candidates incrementally; final candidate has empty `candidate` string.
- **ICE rollback** — Revert to last `stable` state when renegotiation fails. Send `type: "rollback"`.
- **ICE restart** — `createOffer({ iceRestart: true })` to regenerate credentials. Use on `iceConnectionState: "failed"`.

## Caveats

- **Signaling is DIY.** WebRTC specifies no signaling protocol — implement your own via WebSocket/XHR.
- **`addStream` is deprecated.** Always use `addTrack()` / `removeTrack()`.
- **Use adapter.js.** Browser differences exist; the [adapter shim](https://github.com/webrtc/adapter) normalizes them.
- **TURN is costly.** Reserve for fallback. Use `iceTransportPolicy: "relay"` only when IP privacy is required.
- **Symmetric NAT requires TURN.** If both peers are behind symmetric NAT, STUN alone won't suffice.
- **Perfect negotiation pattern** handles *glare* (both peers sending offers simultaneously) — use the polite/impolite pattern.
- **RTCP mux is mandatory.** Non-muxing endpoints fail negotiation.
- **ICE pool:** Set `iceCandidatePoolSize > 0` to prefetch candidates for faster reconnect (RFC 9429).

## Composition Hints

- This skill owns the **protocol fundamentals** (ICE/STUN/TURN/SDP). Mobile and server WebRTC skills reference these concepts rather than duplicating them.
- Combine with a signaling skill (WebSocket, Socket.IO) for the signaling channel layer.
- For server-side media routing (SFU/MCU), see the webrtc-server skill.
- For native mobile WebRTC (Android/iOS SDK), see the webrtc-mobile skill.
