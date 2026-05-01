---
name: webrtc-mobile
description: Native WebRTC SDK for Android (JNI) and iOS (ObjC) — PeerConnectionFactory, camera capture, SurfaceViewRenderer/RTCMTLVideoView rendering, and RTCAudioSession management.
tech_stack: [mobile-native]
language: [java, swift, objective-c]
capability: [native-device, media-processing]
version: "Google WebRTC native SDK tip-of-tree (iOS CocoaPod 1.1.cr-commit-position)"
collected_at: 2025-01-01
---

# WebRTC Native SDK (Android / iOS)

> Source: https://webrtc.googlesource.com/src/+/main/docs/native-code/android/, https://webrtc.github.io/webrtc-org/native-code/ios/, https://webrtc.googlesource.com/src/+/main/sdk/

## Purpose

The WebRTC native SDK provides C++ core libraries with JNI (Android) and Objective-C (iOS) wrappers for embedding real-time audio/video communication in native mobile apps. It mirrors the browser `RTCPeerConnection` API but adds platform-specific camera capture, hardware-accelerated video rendering, and audio session control.

**Protocol internals (ICE/STUN/TURN/SDP) are owned by `webrtc-web` — reference that skill for negotiation flows, candidate types, and NAT traversal fundamentals.** The native SDK uses the same protocols.

## When to Use

- Building VoIP/video-calling features in native Android (Java/Kotlin) or iOS (Swift/ObjC) apps
- When you need direct camera control (Camera2 on Android, `AVCaptureSession` on iOS)
- When you need platform-optimized rendering (GL SurfaceView on Android, Metal on iOS)
- When you need fine-grained audio routing (Bluetooth, speaker, earpiece, audio focus)
- When browser-based WebRTC doesn't meet performance or integration requirements

## Basic Usage

### Android — initialize and connect

```java
// One-time initialization
PeerConnectionFactory.InitializationOptions initOptions =
    PeerConnectionFactory.InitializationOptions.builder(context)
        .createInitializationOptions();
PeerConnectionFactory.initialize(initOptions);

// Create factory
PeerConnectionFactory factory = PeerConnectionFactory.builder()
    .setVideoEncoderFactory(new DefaultVideoEncoderFactory(eglBase.getEglBaseContext(), true, true))
    .setVideoDecoderFactory(new DefaultVideoDecoderFactory(eglBase.getEglBaseContext()))
    .createPeerConnectionFactory();

// Create peer connection
PeerConnection pc = factory.createPeerConnection(
    new PeerConnection.RTCConfiguration(Arrays.asList(
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
    )),
    observer
);

// Camera capture via Camera2
Camera2Enumerator enumerator = new Camera2Enumerator(context);
CameraVideoCapturer capturer = enumerator.createCapturer(
    enumerator.getDeviceNames()[0], null);
VideoSource videoSource = factory.createVideoSource(capturer.isScreencast());
capturer.initialize(surfaceTextureHelper, context, videoSource.getCapturerObserver());
capturer.startCapture(640, 480, 30);

// Add track to peer connection
VideoTrack localVideoTrack = factory.createVideoTrack("video", videoSource);
pc.addTrack(localVideoTrack);

// Create offer (identical flow to browser)
pc.createOffer(sdpObserver, new MediaConstraints());
```

### Android — render remote video

```java
SurfaceViewRenderer renderer = findViewById(R.id.remote_video);
renderer.init(eglBase.getEglBaseContext(), null);
renderer.setMirror(false);
// In observer callback:
remoteVideoTrack.addSink(renderer);
```

### iOS — initialize and connect

```objc
// Create factory
RTCDefaultVideoEncoderFactory *encoderFactory = [[RTCDefaultVideoEncoderFactory alloc] init];
RTCDefaultVideoDecoderFactory *decoderFactory = [[RTCDefaultVideoDecoderFactory alloc] init];
RTCPeerConnectionFactory *factory = [[RTCPeerConnectionFactory alloc]
    initWithEncoderFactory:encoderFactory decoderFactory:decoderFactory];

// Create peer connection
RTCConfiguration *config = [[RTCConfiguration alloc] init];
config.iceServers = @[[[RTCIceServer alloc] initWithURLStrings:@[@"stun:stun.l.google.com:19302"]]];
RTCPeerConnection *pc = [factory peerConnectionWithConfiguration:config
                                                      constraints:nil
                                                         delegate:self];

// Camera capture
RTCCameraVideoCapturer *capturer = [[RTCCameraVideoCapturer alloc] init];
AVCaptureDevice *device = [RTCCameraVideoCapturer captureDevices].firstObject;
AVCaptureDeviceFormat *format = [[RTCCameraVideoCapturer supportedFormatsForDevice:device] firstObject];
[capturer startCaptureWithDevice:device format:format fps:30 completionHandler:nil];
```

### iOS — audio session

```objc
RTCAudioSession *session = [RTCAudioSession sharedInstance];
[session lockForConfiguration];
[session setCategory:AVAudioSessionCategoryPlayAndRecord
        withOptions:AVAudioSessionCategoryOptionAllowBluetooth
              error:nil];
[session setMode:AVAudioSessionModeVoiceChat error:nil];
[session unlockForConfiguration];
[session setActive:YES error:nil];
```

## Key APIs (Summary)

### Android

| Class | Role |
|---|---|
| `PeerConnectionFactory` | Entry point — create connections, sources, tracks |
| `PeerConnection` | Same as browser `RTCPeerConnection` |
| `Camera2Enumerator` / `CameraVideoCapturer` | Discover cameras, create capturers. Prefer Camera2 on API 21+ |
| `SurfaceViewRenderer` | `SurfaceView` subclass for GL-thread video rendering |
| `VideoSource` / `VideoTrack` | Local video pipeline |
| `AudioSource` / `AudioTrack` | Local audio pipeline |

**Build:** GN + Ninja. `target_os="android" target_cpu="arm"` (arm, arm64, x86, x64).

**Studio:** Generate via `build/android/gradle/generate_gradle.py`. Only `target_cpu="arm"` works in Studio.

**Checkout size:** ~16 GB (includes Android SDK/NDK). Linux only.

### iOS

| Class / Protocol | Role |
|---|---|
| `RTCPeerConnectionFactory` | Entry point — init with encoder/decoder factories |
| `RTCPeerConnection` | Same as browser `RTCPeerConnection` |
| `RTCCameraVideoCapturer` | Camera capture via `AVCaptureSession` — format selection, fps control, camera switch |
| `RTCVideoRenderer` (protocol) | Render remote video; implementors: `RTCMTLVideoView` (Metal), `RTCEAGLVideoView` (OpenGL ES) |
| `RTCAudioSession` | Audio routing (speaker/earpiece/Bluetooth), interruptions, category/mode |
| `RTCVideoTrack` / `RTCAudioTrack` | Media tracks |

**CocoaPod:** `pod 'GoogleWebRTC'` — simplest integration. No bitcode support.

**Manual build:** `ninja -C out/ios_64 framework_objc` → `WebRTC.framework`.

**FAT framework:** `build_ios_libs.py --bitcode`. Strip x86_64 before App Store submission.

**Xcode:** `gn gen --ide=xcode`. Compiles via ninja run script — ninja speed + Xcode debugging.

**Signing:** `xcrun security find-identity -v -p codesigning`. Use `ios_enable_code_signing=false` for sim-only.

**Checkout size:** ~6 GB. macOS required.

## Caveats

- **Bitcode (iOS):** CocoaPod lacks bitcode; build manually with `--bitcode` if required.
- **App Store FAT binaries:** Must remove x86_64 slice from FAT frameworks before submission.
- **Android Studio unstable:** [Bug 9282](https://bugs.webrtc.org/9282) — prefer command-line ninja builds. Studio only supports `target_cpu="arm"`.
- **Platform lock:** Android builds require Linux; iOS builds require macOS.
- **Threading:** Native callbacks arrive on internal threads — always dispatch to main/UI thread before updating views.
- **First Android test run:** Must accept on-device permissions dialog.
- **Protocol knowledge:** For ICE candidate types, SDP negotiation, STUN/TURN server configuration, rollback/restart — see `webrtc-web` skill. These concepts are identical in the native SDK.

## Composition Hints

- Always pair with `webrtc-web` for ICE/STUN/TURN/SDP protocol fundamentals.
- Use with a signaling skill (WebSocket, Socket.IO) — the signaling channel is your responsibility on mobile too.
- For server-side SFU/MCU media routing, see the `webrtc-server` skill.
- On Android, `SurfaceViewRenderer` needs an `EglBase` context — initialize it once and share across renderers.
- On iOS, `RTCAudioSession` is a shared singleton — always lock before reconfiguring and unlock after.
