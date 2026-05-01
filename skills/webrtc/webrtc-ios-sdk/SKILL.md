---
name: webrtc-ios-sdk
description: Native iOS SDK for WebRTC — Objective-C wrappers for PeerConnection, media capture, and hardware codecs via CocoaPods or manual GN/Ninja builds.
tech_stack: [ios]
language: [objc, swift]
capability: [native-device, media-processing, realtime-messaging]
version: "WebRTC tip-of-tree"
collected_at: 2025-01-27
---

# WebRTC iOS SDK

> Source: https://webrtc.github.io/webrtc-org/native-code/ios/, https://webrtc.github.io/webrtc-org/native-code/native-apis/, https://webrtc.googlesource.com/src/+/main/sdk/objc/

## Purpose

The WebRTC iOS SDK provides native Objective-C wrappers around the C++ PeerConnection API plus platform-specific components for audio/video capture, rendering, and hardware codec support on iOS and macOS. It is the official way to embed WebRTC in native iOS apps — a direct alternative to WebView-based approaches.

## When to Use

- Building a native iOS app that needs real-time peer-to-peer audio/video via WebRTC.
- You need hardware-accelerated video encoding/decoding (VideoToolbox).
- You need direct access to `RTCPeerConnection`, `RTCVideoTrack`, `RTCAudioTrack`, and `RTCCameraVideoCapturer` from Swift or Objective-C.
- Quick start: use CocoaPods (`pod 'GoogleWebRTC'`). Manual builds: when bitcode support or custom compilation flags are required.

## Basic Usage

### CocoaPods (recommended for most projects)

```ruby
target 'YourApp' do
  platform :ios, '9.0'
  pod 'GoogleWebRTC'
end
```

The pod version tracks tip-of-tree. Pin to a specific `cr-commit-position` for production stability. **No bitcode support** — build manually if needed.

### Manual Build from Source

Prerequisites: macOS, Xcode, [Chromium depot_tools](https://commondatastorage.googleapis.com/chrome-infra-docs/flat/depot_tools/docs/html/depot_tools_tutorial.html).

```bash
# 1. Get the code (~6 GB)
fetch --nohooks webrtc_ios
gclient sync

# 2. Build WebRTC.framework (release, arm64 device)
gn gen out/ios_64 --args='target_os="ios" target_cpu="arm64" is_debug=false'
ninja -C out/ios_64 framework_objc
# → out/ios_64/WebRTC.framework

# 3. Simulator build
gn gen out/ios_sim --args='target_os="ios" target_cpu="x64"'
ninja -C out/ios_sim framework_objc

# 4. FAT framework + bitcode
python build_ios_libs.py --bitcode
# → out_ios_libs/
```

### Key Classes (Obj-C)

| Class | Role |
|---|---|
| `RTCPeerConnectionFactory` | Entry point; creates peer connections and media tracks. Owns signaling + worker threads. |
| `RTCPeerConnection` | Peer connection; create offer/answer, add ICE candidates, receive remote tracks. |
| `RTCCameraVideoCapturer` | Captures video from the device camera. |
| `RTCVideoTrack` / `RTCAudioTrack` | Local and remote media tracks. |
| `RTCVideoRenderer` | Protocol for rendering remote video (e.g., `RTCMTLVideoView` for Metal). |
| `RTCConfiguration` | ICE server configuration (STUN/TURN). |

### Threading Rules

- The signaling thread proxies all API calls — you can call from any thread.
- All callbacks fire on the signaling thread. **Return quickly**; defer heavy work to another thread.
- The worker thread handles resource-intensive streaming internally.

## Key APIs (Summary)

**PeerConnectionFactory** — initialize with encoder/decoder factories, then create peer connections and media sources:
```objc
RTCPeerConnectionFactory *factory = [[RTCPeerConnectionFactory alloc]
    initWithEncoderFactory: [[RTCDefaultVideoEncoderFactory alloc] init]
    decoderFactory: [[RTCDefaultVideoDecoderFactory alloc] init]];
```

**RTCPeerConnection** — standard WebRTC lifecycle:
- `createOfferWithConstraints:` / `createAnswerWithConstraints:` — SDP generation.
- `setLocalDescription:` / `setRemoteDescription:` — apply SDP.
- `addIceCandidate:` — trickle ICE.
- `addTrack:` / `removeTrack:` — media management.
- `close` — tear down.

**RTCCameraVideoCapturer** — start/stop camera capture with format and frame rate selection.

**RTCVideoRenderer** — implement to receive frames, or use `RTCMTLVideoView` (Metal) / `RTCEAGLVideoView` (OpenGL).

## Caveats

- **Bitcode**: CocoaPods distribution has NO bitcode. For bitcode, build manually with `build_ios_libs.py --bitcode`.
- **App Store**: FAT frameworks containing `x86-64` (simulator) cannot ship. Strip the simulator slice before submission.
- **6 GB checkout**: Disable Spotlight on the checkout directory to avoid indexing slowdowns.
- **Xcode compilation**: Direct Xcode builds are not supported. The generated `.xcworkspace` uses a run-script that calls Ninja.
- **API stability**: tip-of-tree means APIs can change between `cr-commit-position` revisions. Pin for production.
- **Code signing**: required for device deployment (`xcrun security find-identity -v -p codesigning`). Skip with `ios_enable_code_signing=false` for build-only.

## Composition Hints

- This skill covers **build and integration** of the iOS SDK. Pair with `webrtc-rtcpeerconnection` for the browser-side API concepts that mirror the native PeerConnection behavior.
- For SDP negotiation patterns (offer/answer flow), see `webrtc-sdp-negotiation`.
- For ICE/STUN/TURN server configuration passed into `RTCConfiguration`, see `webrtc-ice-connection`.
- The `RTCCameraVideoCapturer` integrates with `getUserMedia` concepts from `webrtc-mediastream-getusermedia`.
- If targeting both iOS and Android, compare with `webrtc-android-sdk` for platform-specific differences.
