---
name: webrtc-mediastream-getusermedia
description: Browser media capture via getUserMedia — request camera/microphone, apply constraints, enumerate devices, and manage MediaStream tracks.
tech_stack: [web]
language: [javascript]
capability: [native-device, media-processing]
version: "WebRTC unversioned (browser API)"
collected_at: 2025-11-30
---

# MediaStream / getUserMedia

> Source: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia, https://webrtc.org/getting-started/media-devices, https://developer.mozilla.org/en-US/docs/Web/API/MediaStream

## Purpose

`getUserMedia()` is the browser entry point for accessing local cameras and microphones. It prompts the user for permission and returns a `MediaStream` — a collection of `MediaStreamTrack` objects (one per audio/video source). The `MediaStream` can be previewed locally in a `<video>` element or sent to a remote peer via `RTCPeerConnection.addTrack()`. Companion APIs `enumerateDevices()` and `getDisplayMedia()` round out the media-capture surface.

## When to Use

- Capturing camera and microphone before a WebRTC call
- Building a device picker UI (camera/microphone selection)
- Applying quality constraints: resolution, frame rate, echo cancellation
- Switching between front/rear cameras on mobile
- Local-only media preview (video self-view, audio level meter)
- Screen/window/tab capture (via `getDisplayMedia()` — related but separate API)

## Basic Usage

### Minimal capture

```js
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
});
// Attach to video element for local preview
document.querySelector('video').srcObject = stream;
```

The `<video>` element needs `autoplay` and `playsinline`:

```html
<video autoplay playsinline controls="false"></video>
```

### With error handling

```js
try {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  // use stream
} catch (err) {
  switch (err.name) {
    case 'NotAllowedError':
      // User denied permission or page is HTTP
      break;
    case 'NotFoundError':
      // No camera/microphone found matching constraints
      break;
    case 'OverconstrainedError':
      // Constraints too strict — err.constraint tells you which one
      break;
    case 'NotReadableError':
      // Hardware in use by another application
      break;
  }
}
```

### Stopping tracks (release camera)

```js
stream.getTracks().forEach(track => track.stop());
```

## Key APIs (Summary)

### Constraints system

Constraint values use a three-tier system:

| Form | Behavior |
|---|---|
| Plain value: `width: 1280` | Treated as `ideal` — best-effort, no rejection |
| `ideal`: `width: { ideal: 1280 }` | Browser finds closest match ("gravity") |
| `min` / `max`: `width: { min: 640 }` | Mandatory bounds — rejects with `OverconstrainedError` if unmet |
| `exact`: `width: { exact: 1280 }` | Mandatory exact value (`min === max`) |

This applies to numeric constraints (width, height, frameRate, aspectRatio, etc.) and non-numeric ones (facingMode, deviceId, resizeMode).

### Common constraint recipes

```js
// Prefer 720p (won't reject if unavailable)
{ video: { width: 1280, height: 720 } }

// Require at least 720p (rejects if unavailable)
{ video: { width: { min: 1280 }, height: { min: 720 } } }

// Ideal 720p, accept 576p-1080p range
{ video: { width: { min: 1024, ideal: 1280, max: 1920 },
           height: { min: 576, ideal: 720, max: 1080 } } }

// Front camera on mobile
{ video: { facingMode: 'user' } }

// Rear camera — mandatory
{ video: { facingMode: { exact: 'environment' } } }

// Specific device by ID
{ video: { deviceId: cameraId } }               // fallback OK
{ video: { deviceId: { exact: cameraId } } }     // mandatory

// Low frame rate for bandwidth-constrained WebRTC
{ video: { frameRate: { ideal: 10, max: 15 } } }

// Echo cancellation on microphone
{ audio: { echoCancellation: true } }

// Force browser to crop/downscale (not just pick lower res)
{ video: { width: 1280, height: 720, resizeMode: 'crop-and-scale' } }
```

### MediaStream — track management

| Method | Purpose |
|---|---|
| `getTracks()` | All tracks (audio + video) |
| `getAudioTracks()` | Audio tracks only |
| `getVideoTracks()` | Video tracks only |
| `getTrackById(id)` | Lookup by track ID |
| `addTrack(track)` | Add a track copy (no-op if exists) |
| `removeTrack(track)` | Remove a track (no-op if not present) |
| `clone()` | Deep-clone stream (new `id`, same tracks) |

Key properties: `active` (boolean), `id` (UUID string).

### Enumerating and watching devices

```js
// Get all video input devices
const devices = await navigator.mediaDevices.enumerateDevices();
const cameras = devices.filter(d => d.kind === 'videoinput');
// Each device: { deviceId, kind, label, groupId }

// Watch for plug/unplug
navigator.mediaDevices.addEventListener('devicechange', async () => {
  const updated = await navigator.mediaDevices.enumerateDevices();
  // Rebuild device picker UI
});
```

## Caveats

- **HTTPS only.** `navigator.mediaDevices` is `undefined` on HTTP. For local development, `localhost` is treated as a secure context.
- **Permissions Policy can block.** Even on HTTPS, the `camera` and `microphone` Permissions-Policy headers or `<iframe allow>` attribute can prevent access. Returns `NotAllowedError`.
- **User may dismiss the prompt.** The Promise may hang indefinitely — it neither resolves nor rejects. Always combine with a timeout if you need deterministic behavior.
- **Empty constraints = TypeError.** `getUserMedia({})` always rejects because both `video` and `audio` default to `false`.
- **`deviceId` is ephemeral.** Device IDs change across browsing sessions and when cookies are cleared. Store them only within a session; always have a fallback to generic constraints.
- **`OverconstrainedError` before permission.** Browser evaluates constraints before showing the permission prompt. Malicious sites could use this to fingerprint available hardware. Don't probe constraints iteratively.
- **Camera switch requires `track.stop()`.** Before calling `getUserMedia` with a different `facingMode`, stop existing tracks to release the camera hardware. Otherwise the switch may silently fail.
- **Track order is not guaranteed.** `getTracks()`, `getAudioTracks()`, `getVideoTracks()` order varies across browsers and calls. Identify tracks by `kind` and `id`, not position.
- **`deviceId` override by user choice.** The camera the user picks in the permission prompt may override your `deviceId` constraint. Use `{ exact: deviceId }` if you must require a specific device.
- **`resizeMode: 'crop-and-scale'` has CPU cost.** The browser must decode and resize high-resolution frames in software. Prefer letting the hardware produce the target resolution natively when possible.

## Composition Hints

- **With `RTCPeerConnection`**: Capture stream → `stream.getTracks().forEach(t => pc.addTrack(t, stream))` → then `createOffer`. This is the standard WebRTC call setup.
- **With `getDisplayMedia()`**: Screen capture produces a `MediaStream` just like `getUserMedia`. Use `getDisplayMedia({ video: true, audio: true })` for screen sharing; add the resulting tracks to the same or a separate `RTCPeerConnection`.
- **With `MediaRecorder`**: Pass the `MediaStream` to `new MediaRecorder(stream)` for local recording of camera/screen.
- **With Canvas**: Use `canvas.captureStream()` to create a synthetic `MediaStream` from canvas drawing, then add to `RTCPeerConnection` for streaming non-camera content.
- **Device picker pattern**: Call `enumerateDevices()` on page load, build a `<select>` with device labels, use `deviceId` in constraints when the user picks. Re-enumerate on `devicechange` to handle hot-plugging.
- **Track muting**: Rather than stopping tracks, set `track.enabled = false` to mute (camera light stays on but sends black/silence). This avoids re-negotiation.
