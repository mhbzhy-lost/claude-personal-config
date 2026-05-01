---
name: webrtc-android-sdk
description: WebRTC Android native SDK — PeerConnectionFactory, camera capture (Camera1/Camera2), SurfaceViewRenderer, EGL setup, and JNI integration for real-time audio/video on Android.
tech_stack: [android]
language: [java, kotlin]
capability: [native-device, realtime-messaging]
version: "WebRTC unversioned"
collected_at: 2025-11-10
---

# WebRTC Android SDK

> Source: https://webrtc.github.io/webrtc-org/native-code/android/, https://webrtc.github.io/webrtc-org/native-code/native-apis/, https://webrtc.googlesource.com/src/+/main/sdk/android/api/org/webrtc/

## Purpose

The WebRTC Android SDK provides Java/Kotlin bindings (via JNI) to the WebRTC C++ native library, enabling real-time audio/video communication in native Android applications. It wraps the full WebRTC 1.0 API surface — peer connections, media capture, hardware-accelerated codecs, and EGL-based rendering — into an Android-idiomatic `org.webrtc` package.

## When to Use

- Building native Android VoIP/video-calling apps with WebRTC
- Integrating real-time media into existing Android applications
- Accessing Android Camera1 or Camera2 for WebRTC media capture
- Rendering remote video streams with hardware-accelerated `SurfaceViewRenderer`
- Using hardware video codecs (MediaCodec via `HardwareVideoEncoderFactory` / `HardwareVideoDecoderFactory`)
- Building WebRTC from source for custom Android builds (GN + Ninja)

## Basic Usage

### 1. Add the prebuilt library (Gradle)

```groovy
dependencies {
    implementation 'org.webrtc:google-webrtc:1.0.+'
}
```

The version format is `1.0.<Cr-Commit-Position>`. These are development snapshots — pin a specific commit for production.

### 2. Initialize PeerConnectionFactory

```java
PeerConnectionFactory.initialize(
    PeerConnectionFactory.InitializationOptions.builder(context)
        .setFieldTrials("")
        .createInitializationOptions()
);

PeerConnectionFactory factory = PeerConnectionFactory.builder()
    .setVideoEncoderFactory(new DefaultVideoEncoderFactory(
        eglBase.getEglBaseContext(), true, true))
    .setVideoDecoderFactory(new DefaultVideoDecoderFactory(
        eglBase.getEglBaseContext()))
    .createPeerConnectionFactory();
```

### 3. Create a PeerConnection with ICE servers

```java
PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(
    Arrays.asList(
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
    )
);

PeerConnection pc = factory.createPeerConnection(config, observer);
```

### 4. Capture camera video

```java
Camera2Enumerator enumerator = new Camera2Enumerator(context);
String[] deviceNames = enumerator.getDeviceNames();
CameraVideoCapturer capturer = enumerator.createCapturer(deviceNames[0], null);

VideoSource videoSource = factory.createVideoSource(false);
capturer.initialize(surfaceTextureHelper, context, videoSource.getCapturerObserver());
capturer.startCapture(1280, 720, 30);
```

### 5. Render remote video

```java
SurfaceViewRenderer renderer = view.findViewById(R.id.remote_video);
renderer.init(eglBase.getEglBaseContext(), null);
renderer.setMirror(false);
remoteVideoTrack.addSink(renderer);
```

## Key APIs (Summary)

| Category | Key Classes | Role |
|----------|------------|------|
| **Core** | `PeerConnectionFactory`, `PeerConnection`, `PeerConnection.RTCConfiguration` | Factory creation, peer lifecycle, ICE/SDP config |
| **Media capture** | `Camera2Capturer`, `Camera1Capturer`, `CameraVideoCapturer`, `Camera2Enumerator` | Camera access and video frame capture |
| **Media tracks** | `VideoTrack`, `AudioTrack`, `VideoSource`, `AudioSource`, `MediaStream` | Local/remote media track management |
| **Rendering** | `SurfaceViewRenderer`, `EglBase`, `EglBase14`, `SurfaceTextureHelper` | EGL context setup, video rendering to SurfaceView |
| **SDP/ICE** | `SessionDescription`, `IceCandidate`, `SdpObserver` | Offer/answer and candidate exchange |
| **Codecs** | `DefaultVideoEncoderFactory`, `DefaultVideoDecoderFactory`, `HardwareVideoEncoderFactory`, `HardwareVideoDecoderFactory` | Hardware/software codec selection |
| **Data** | `DataChannel` | Arbitrary binary data between peers |
| **Stats** | `RTCStats`, `RTCStatsReport`, `RTCStatsCollectorCallback` | Connection and media quality monitoring |
| **RTP** | `RtpSender`, `RtpReceiver`, `RtpTransceiver`, `RtpParameters` | Media transmission control |

## Caveats

- **Prebuilts are dev-only:** JCenter libraries are tip-of-tree snapshots. Pin a specific commit hash for production builds.
- **Linux-only build host:** Building from source requires Linux. The checkout is ~16 GB (8 GB for Android SDK/NDK alone).
- **Android Studio support is broken:** See [bug 9282](https://bugs.webrtc.org/9282). Only `arm` target_cpu is supported in Android Studio builds.
- **Threading:** All callbacks arrive on the signaling thread. Return quickly — never block it. Post heavy work to a separate thread. The worker thread handles data streaming internally.
- **EGL lifecycle:** `SurfaceViewRenderer` manages EGL for you — prefer it over manual `EglBase` management, which is error-prone.
- **Camera API choice:** Camera1 is legacy but widely compatible. Camera2 (API 21+) offers manual focus/ISO but varies across manufacturers. Use `Camera2Enumerator` first, fall back to `Camera1Enumerator`.
- **First-run dialog:** The first time you run a native test on a device, you must accept a confirmation dialog.
- **JNI bridging:** The Java layer is thin JNI over C++. Performance-critical paths (encoding, rendering) stay native — don't block the Java side.

## Composition Hints

- **ICE/SDP:** The Android `PeerConnection` API mirrors the browser — pair with `webrtc-ice-connection` and `webrtc-sdp-negotiation` for connection establishment patterns.
- **iOS counterpart:** For cross-platform native apps, see `webrtc-ios-sdk` which provides the equivalent ObjC/Swift API surface.
- **Server infrastructure:** Android clients connect through the same STUN/TURN servers — use `webrtc-coturn` for deployment. For multi-party, pair with `webrtc-mediasoup` or `webrtc-janus-gateway` as the SFU/MCU backend.
- **Building from source:** Use `gn gen out/Debug --args='target_os="android" target_cpu="arm64"'` for ARM64 devices. Use `target_cpu="x64"` for x86_64 emulators.
