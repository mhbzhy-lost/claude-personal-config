---
name: webrtc-ice-connection
description: WebRTC ICE connection establishment — STUN/TURN server configuration, Trickle ICE candidate exchange, connection state monitoring, and NAT traversal.
tech_stack: [web]
language: [javascript]
capability: [realtime-messaging]
version: "WebRTC unversioned"
collected_at: 2025-11-10
---

# WebRTC ICE Connection

> Source: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols, https://webrtc.org/getting-started/peer-connections, https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event

## Purpose

ICE (Interactive Connectivity Establishment) is the framework WebRTC uses to establish peer-to-peer connections across NATs and firewalls. It leverages STUN servers to discover public addresses and TURN servers as relay fallbacks when direct connections are impossible (e.g., symmetric NAT). The ICE agent gathers connectivity candidates, exchanges them via your signaling channel, and converges on the best network path.

## When to Use

- Connecting two WebRTC peers across any network topology
- Configuring `iceServers` (STUN/TURN) in `RTCPeerConnection` constructor
- Implementing Trickle ICE for faster call setup by sending candidates as they arrive
- Monitoring `iceConnectionState` and `iceGatheringState` for connection lifecycle
- Performing ICE restart (`createOffer({ iceRestart: true })`) to recover failed connections
- Debugging NAT traversal issues — determining whether STUN suffices or TURN relay is needed

## Basic Usage

### 1. Configure ICE servers in RTCPeerConnection

```js
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:turn.example.com:3478',
      username: 'user',
      credential: 'password'
    }
  ]
});
```

### 2. Exchange ICE candidates via signaling (Trickle ICE)

**Sender — capture and forward local candidates:**
```js
pc.addEventListener('icecandidate', event => {
  if (event.candidate) {
    signaling.send({ type: 'new-ice-candidate', candidate: event.candidate });
  }
  // event.candidate === null → ICE gathering complete, do NOT forward
  // event.candidate === ""   → end of this generation, SHOULD forward
});
```

**Receiver — add remote candidates:**
```js
signaling.addEventListener('message', async msg => {
  if (msg.iceCandidate) {
    try {
      await pc.addIceCandidate(msg.iceCandidate);
    } catch (e) {
      console.error('Failed to add ICE candidate', e);
    }
  }
});
```

### 3. Monitor connection state

```js
pc.addEventListener('icegatheringstatechange', () => {
  // States: 'new' → 'gathering' → 'complete'
  if (pc.iceGatheringState === 'complete') {
    console.log('All ICE candidates gathered');
  }
});

pc.addEventListener('connectionstatechange', () => {
  if (pc.connectionState === 'connected') {
    console.log('Peers connected via ICE');
  }
});
```

## Key APIs (Summary)

| API | Role |
|-----|------|
| `new RTCPeerConnection({ iceServers })` | Provide STUN/TURN server URLs and credentials |
| `pc.addEventListener('icecandidate', …)` | Fires per candidate; forward non-null candidates to remote peer |
| `pc.addIceCandidate(candidate)` | Add a candidate received from the remote peer |
| `pc.iceGatheringState` | `'new'` / `'gathering'` / `'complete'` — observe via `icegatheringstatechange` |
| `pc.iceConnectionState` | `'new'` / `'checking'` / `'connected'` / `'completed'` / `'failed'` / `'disconnected'` / `'closed'` |
| `pc.createOffer({ iceRestart: true })` | Triggers ICE restart with new credentials and candidate generation |
| `event.candidate` values | Non-null RTCIceCandidate → forward; `""` → end-of-generation, forward; `null` → all gathering done, do NOT forward |

## Caveats

- **`candidate === null` vs `candidate === ""`:** `null` means all gathering is complete — do NOT send to remote. Empty string `""` means end of the current generation — DO send. Confusing these breaks peer negotiation.
- **Prefer `icegatheringstatechange`:** More reliable than checking for `null` candidates to detect gathering completion.
- **TURN is expensive:** TURN relays all media through a server. Use only when STUN fails (symmetric NAT). Always include both STUN and TURN in production.
- **Signaling is your responsibility:** WebRTC does not specify a signaling protocol. You must implement your own channel (WebSocket, REST, etc.).
- **ICE restart:** When `iceConnectionState` enters `'failed'`, call `createOffer({ iceRestart: true })` to regenerate credentials and candidates. Do not create a new RTCPeerConnection.
- **Browser support:** `icecandidate` event is widely available since September 2017 across all major browsers.

## Composition Hints

- **SDP negotiation:** ICE candidates are only gathered after `setLocalDescription()` — pair this skill with `webrtc-sdp-negotiation` for the full offer/answer flow.
- **coturn:** For production TURN/STUN deployment, use `webrtc-coturn` which provides the server-side configuration patterns.
- **RTCPeerConnection:** This skill focuses on the ICE layer; `webrtc-rtcpeerconnection` covers the broader peer connection lifecycle (addTrack, getStats, events).
- **Debugging:** When connections fail, check `iceConnectionState` transitions. `'checking'` → `'failed'` typically means firewall/NAT issues — add TURN. `'checking'` → `'disconnected'` may recover on its own or require ICE restart.
