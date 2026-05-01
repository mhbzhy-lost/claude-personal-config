---
name: webrtc-rtcpeerconnection
description: Core WebRTC peer-to-peer connection API — create offers/answers, exchange ICE candidates, send/receive media tracks, and manage connection lifecycle.
tech_stack: [web]
language: [javascript]
capability: [realtime-messaging, media-processing]
version: "WebRTC unversioned (browser API)"
collected_at: 2025-11-10
---

# RTCPeerConnection

> Source: https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection, https://webrtc.org/getting-started/peer-connections, https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols

## Purpose

`RTCPeerConnection` is the central browser API for establishing a peer-to-peer WebRTC connection. It handles the full lifecycle: negotiating media codecs via SDP offer/answer exchange, discovering network paths via ICE (STUN/TURN), transmitting audio/video tracks, and monitoring connection health. Every WebRTC browser application — whether a video call, screen share, or data channel app — revolves around an `RTCPeerConnection` instance.

## When to Use

- Building browser-to-browser audio/video calls
- Creating data channels alongside or instead of media
- Connecting to a WebRTC media server (SFU/MCU)
- Any use case requiring a peer-to-peer real-time transport in the browser

## Basic Usage

The core flow is: create → attach tracks → negotiate → exchange ICE candidates → monitor state.

### 1. Create with ICE server config

```js
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});
```

### 2. Attach local media tracks

```js
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
stream.getTracks().forEach(track => pc.addTrack(track, stream));
```

### 3. Initiate a call (caller creates offer)

```js
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
// Send offer to remote peer via signaling channel
signaling.send({ type: 'offer', sdp: pc.localDescription });
```

### 4. Answer a call (callee creates answer)

```js
// Receive offer, set as remote description
await pc.setRemoteDescription(new RTCSessionDescription(receivedOffer));
const answer = await pc.createAnswer();
await pc.setLocalDescription(answer);
// Send answer back via signaling
signaling.send({ type: 'answer', sdp: pc.localDescription });
```

### 5. Exchange ICE candidates (Trickle ICE)

```js
// Send local candidates as they're discovered
pc.addEventListener('icecandidate', e => {
  if (e.candidate) signaling.send({ type: 'ice-candidate', candidate: e.candidate });
});

// Receive and add remote candidates
signaling.on('ice-candidate', async data => {
  await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
});
```

### 6. Receive remote tracks

```js
pc.addEventListener('track', event => {
  remoteVideo.srcObject = event.streams[0];
});
```

### 7. Monitor connection state

```js
pc.addEventListener('connectionstatechange', () => {
  console.log('Connection state:', pc.connectionState);
  // new → connecting → connected | failed | disconnected | closed
});
```

## Key APIs (Summary)

### High-frequency methods

| Method | Role |
|---|---|
| `createOffer()` | Generate local SDP offer |
| `createAnswer()` | Generate local SDP answer |
| `setLocalDescription(desc)` | Apply local SDP (returns Promise) |
| `setRemoteDescription(desc)` | Apply remote SDP (returns Promise) |
| `addIceCandidate(candidate)` | Inject remote ICE candidate |
| `addTrack(track, ...streams)` | Send a `MediaStreamTrack` to remote peer |
| `removeTrack(sender)` | Stop sending a track (sender stays in `getSenders()`) |
| `close()` | Tear down the connection |
| `getStats()` | Get connection/track statistics (Promise) |
| `restartIce()` | Trigger ICE restart on both ends |

### Key state properties

| Property | Values |
|---|---|
| `connectionState` | `new`, `connecting`, `connected`, `disconnected`, `failed`, `closed` |
| `iceConnectionState` | `new`, `checking`, `connected`, `completed`, `failed`, `disconnected`, `closed` |
| `iceGatheringState` | `new`, `gathering`, `complete` |
| `signalingState` | `stable`, `have-local-offer`, `have-remote-offer`, `have-local-pranswer`, `have-remote-pranswer`, `closed` |

### Key events

| Event | Trigger |
|---|---|
| `icecandidate` | New local ICE candidate ready — must relay to remote |
| `track` | Remote track arrived — attach to video/audio element |
| `negotiationneeded` | Renegotiation required (e.g., after `addTrack`) — caller must create+send a new offer |
| `datachannel` | Remote peer opened an `RTCDataChannel` |
| `connectionstatechange` | Top-level connectivity changed |
| `iceconnectionstatechange` | ICE layer state changed |

### Obsolete — avoid

- `addStream()` / `removeStream()` → use `addTrack()` / `removeTrack()`
- `addstream` / `removestream` events → use `track` event

## Caveats

- **Signaling is your problem.** WebRTC provides the media/ICE plumbing but NOT the signaling channel. You must implement your own (WebSocket, REST, Firestore, etc.) to exchange SDP and ICE candidates.
- **Symmetric NAT → TURN mandatory.** STUN alone won't traverse Symmetric NAT. Always deploy a TURN server (e.g., coturn) as fallback for production.
- **`setLocalDescription` / `setRemoteDescription` are async.** Always `await` them. Calling them out of signaling-state order throws `InvalidStateError`.
- **Trickle ICE beats waiting.** Don't wait for `iceGatheringState === 'complete'` before sending the offer. Send each candidate as it fires — dramatically reduces connection setup time.
- **`addTrack` triggers `negotiationneeded`.** After adding tracks, the caller side must create and send a new offer. The simple "perfect negotiation" pattern handles this, but be aware when building custom signaling.
- **`removeTrack` doesn't remove the sender.** The `RTCRtpSender` stays in `getSenders()`; the remote peer sees the track end. To fully clean up, call `sender.replaceTrack(null)` or renegotiate.
- **No SDP munging.** Modern WebRTC discourages manual SDP manipulation. Use `addTransceiver()` and `RTCRtpSender.setParameters()` for codec control instead.
- **Connection state ≠ ICE state.** `connectionState` aggregates ICE + DTLS + SCTP; `iceConnectionState` is ICE-only. Watch `connectionState` for the user-facing status.
- **Close explicitly.** An `RTCPeerConnection` that falls out of scope is not immediately GC'd. Call `pc.close()` to release camera/microphone and network resources.

## Composition Hints

- **With `getUserMedia`**: Call `getUserMedia` → `addTrack` each track → `createOffer` to start a call.
- **With `RTCDataChannel`**: Call `pc.createDataChannel('chat')` on the caller side; listen for `datachannel` event on the callee side.
- **With media servers (SFU)**: Instead of peer-to-peer, send one `RTCPeerConnection` to the SFU; the SFU relays media to other participants. Each `pc` handles one upstream + one downstream.
- **Perfect negotiation pattern**: Use a polite/impolite role system to avoid glare (both peers creating offers simultaneously). The polite peer rolls back its offer when it receives an incoming offer while `signalingState !== 'stable'`.
- **ICE restart**: Call `pc.restartIce()` and then create a new offer — both ends will regather candidates. Useful when a connection goes `disconnected` but hasn't `failed`.
