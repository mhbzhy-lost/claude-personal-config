---
name: webrtc-janus-gateway
description: Janus WebRTC Gateway — general-purpose WebRTC server with plugin architecture, janus.js client library, and multi-transport signaling (HTTP/WS/RabbitMQ/MQTT).
tech_stack: [webrtc]
language: [javascript, c]
capability: [media-processing, realtime-messaging, websocket]
version: "Janus multistream (post-0.x)"
collected_at: 2026-03-16
---

# Janus WebRTC Gateway

> Source: https://janus.conf.meetecho.com/docs/, https://github.com/meetecho/janus-gateway, https://janus.conf.meetecho.com/docs/JS.html

## Purpose

Janus is a general-purpose WebRTC server written in C that acts as a **signaling and media relay hub**. It does not implement any application logic itself — instead, it provides a **plugin architecture** where each plugin adds specific functionality (echo testing, video rooms, audio bridges, SIP gateway, streaming). The server exchanges JSON messages with clients and relays RTP/RTCP between browsers and plugins. Janus functions as an SFU (Selective Forwarding Unit): media streams are routed through the server, not mixed.

## When to Use

- Multi-party video conferencing (VideoRoom plugin — SFU pattern)
- Audio-only conference bridges (AudioBridge plugin)
- WebRTC streaming / RTSP ingestion (Streaming plugin)
- SIP-to-WebRTC gateway for telephony interop
- Echo testing for WebRTC diagnostics (EchoTest plugin)
- Any WebRTC app needing server-side media routing with per-plugin application logic

## Basic Usage

### 1. Initialize janus.js

```js
Janus.init({
   debug: true,
   dependencies: Janus.useDefaultDependencies(), // or Janus.useOldDependencies() for jQuery
   callback: function() { /* ready */ }
});
```

For ES modules: `import * as Janus from './janus.es.js'`

### 2. Create a Session

```js
var janus = new Janus({
    server: 'ws://yourserver:8188/',       // WebSocket or HTTP URL, or array for failover
    iceServers: [{urls: 'stun:stun.l.google.com:19302'}],
    success: function() { /* session ready — attach to plugins */ },
    error: function(cause) { /* session failed */ },
    destroyed: function() { /* session ended */ }
});
```

**Failover pattern:** `server: ['ws://host:8188/', 'http://host:8088/janus']` — tries WebSocket first, falls back to HTTP long-polling.

### 3. Attach to a Plugin (creates a Handle)

```js
janus.attach({
    plugin: "janus.plugin.echotest",       // plugin package name
    success: function(pluginHandle) {
        // pluginHandle is the Handle — use it for all subsequent interaction
    },
    error: function(cause) { /* could not attach */ },
    onmessage: function(msg, jsep) {
        // msg: JSON from plugin
        // jsep != null → WebRTC negotiation required
    },
    onlocaltrack: function(track, added) { /* local track for display */ },
    onremotetrack: function(track, mid, added, metadata) {
        // metadata.reason: 'created' | 'ended' | 'mute' | 'unmute'
    },
    webrtcState: function(on) { /* PeerConnection active/inactive */ },
    mediaState: function(mid, type, on) { /* media flowing or stopped */ },
    slowLink: function(uplink, lost) { /* packet loss detected */ },
    ondataopen: function() { /* Data Channel ready */ },
    ondata: function(data) { /* Data Channel message */ },
    oncleanup: function() { /* PeerConnection closed, handle still valid */ },
    detached: function() { /* handle destroyed by plugin, no longer usable */ }
});
```

### 4. WebRTC Negotiation (the core loop)

**You initiate:**
```js
pluginHandle.createOffer({
    media: { audio: true, video: true },
    success: function(jsep) {
        pluginHandle.send({ message: { request: "start" }, jsep: jsep });
    }
});
```

**Plugin initiates** (handled in `onmessage`):
```js
onmessage: function(msg, jsep) {
    if (jsep) {
        if (jsep.type === 'offer') {
            pluginHandle.createAnswer({
                jsep: jsep,
                media: { audio: true, video: true },
                success: function(ourJsep) {
                    pluginHandle.send({ message: { request: "ack" }, jsep: ourJsep });
                }
            });
        } else {
            pluginHandle.handleRemoteJsep({ jsep: jsep });
        }
    }
}
```

### 5. Handle API — Essential Methods

| Method | Purpose |
|--------|---------|
| `send({message, jsep})` | Send app message + optional SDP to plugin |
| `createOffer({media, success})` | Generate local OFFER |
| `createAnswer({jsep, media, success})` | Generate ANSWER from remote OFFER |
| `handleRemoteJsep({jsep})` | Process incoming ANSWER |
| `replaceTracks({audio, video})` | Swap tracks without renegotiation |
| `hangup()` | Close PeerConnection |
| `detach()` | Destroy handle + PeerConnection |
| `muteAudio()` / `unmuteAudio()` / `isAudioMuted()` | Audio mute control |
| `muteVideo()` / `unmuteVideo()` / `isVideoMuted()` | Video mute control |
| `getLocalTracks()` / `getRemoteTracks()` | List tracks with type/mid/label |
| `getBitrate(mid)` | Current video bitrate stats |
| `data({text: "..."})` | Send via Data Channel |
| `dtmf({digit: "1", duration: 250})` | Send DTMF tone |

## Key APIs (Summary)

### Server CLI — Essential Flags

```
turnserver -i <public-ip> -S <stun:port> -1 <nat-1-1-ip>          # Networking
turnserver -f                # Full-trickle ICE (default: half-trickle)
turnserver -I                # ICE Lite mode
turnserver -s 120            # Session timeout (default: 60s)
turnserver -a <apisecret>    # API secret for request auth
turnserver -t 5 -W 10        # No-media timer (5s), slowlink threshold (10 packets/s)
turnserver -r 20000-40000    # RTP/RTCP port range
```

### Available Plugin Identifiers

| Plugin | ID | Purpose |
|--------|-----|---------|
| EchoTest | `janus.plugin.echotest` | Echo diagnostic |
| VideoRoom | `janus.plugin.videoroom` | Multi-party SFU video |
| AudioBridge | `janus.plugin.audiobridge` | Audio conference |
| Streaming | `janus.plugin.streaming` | RTSP/RTMP ingest & streaming |
| SIP | `janus.plugin.sip` | SIP gateway |
| RecordPlay | `janus.plugin.recordplay` | Recording & playback |
| TextRoom | `janus.plugin.textroom` | Text chat via Data Channels |

## Caveats

- **libnice on Ubuntu**: distro package is broken — must compile from `gitlab.freedesktop.org/libnice/libnice` master with meson+ninja.
- **libsrtp**: 1.4.x is unsupported; 2.x is recommended. Must configure with `--enable-openssl` for AES-GCM support.
- **Half-trickle default**: Janus sends ICE candidates in batches (half-trickle). Use `-f` for full-trickle if your app needs per-candidate signaling.
- **ICE-TCP**: only works with ICE Lite (`-I -T` together).
- **Session timeout**: 60s default. Idle sessions are reclaimed — keep a heartbeat if sessions need to persist.
- **janus.js + webrtc-adapter**: janus.js depends on the `webrtc-adapter` shim. Always include it as a dependency in your HTML.
- **Firefox**: `getLocalVolume()` / `getRemoteVolume()` not supported.
- **Windows**: not natively supported — WSL only. Unofficial .exe builds are not endorsed.
- **BoringSSL**: newer versions need `CCLD=c++` for make; use `--enable-boringssl=/path`.
- **FreeBSD**: `rtp_forward` only works with IPv6 due to known issue.

## Composition Hints

- **With coturn**: deploy Janus behind coturn for TURN relay when clients are behind restrictive NATs. Configure `-S <coturn-ip>:3478` and set `iceServers` in the janus.js client to point at coturn.
- **With mediasoup**: Janus (SFU, C, plugin-based) vs mediasoup (SFU, Node.js, lower-level API). Use Janus when built-in plugins match your use case; use mediasoup when you need custom media routing logic in Node.js.
- **Signaling integration**: janus.js handles all Janus protocol details. Your app server only needs to serve the web page and optionally proxy/generate TURN REST API credentials. Janus can expose its API directly to clients or be proxied behind your backend.
- **Scaling**: run multiple Janus instances behind a load balancer. Use the `server` array in janus.js for client-side failover. VideoRoom plugin supports room-level clustering.
- **Authentication**: use `--apisecret` + `token` for API-level auth. For plugin-level auth, implement it in your application message layer via the `send`/`onmessage` JSON protocol.
