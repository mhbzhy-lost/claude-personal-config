---
name: video-player-hls-dash
description: 在浏览器中基于 MSE 播放 HLS 与 MPEG-DASH 自适应流，覆盖 hls.js 与 dash.js 的接入、配置、事件与错误恢复
tech_stack: [web, html5-video, mse, hls, dash]
language: [javascript, typescript]
capability: [media-processing]
version: "hls.js v1; dash.js 4.x/5.x"
collected_at: 2026-04-18
---

# HLS / DASH Web 播放（hls.js + dash.js）

> 来源：https://github.com/video-dev/hls.js、https://dashif.org/dash.js/

## 用途

在不原生支持 HLS/DASH 的浏览器（主要是 Chrome、Firefox、Edge；Safari 原生支持 HLS）上，通过 MediaSource Extensions (MSE) 将 `.m3u8` / `.mpd` 清单拉取、分片、解复用后喂给 `<video>`，实现自适应码率、字幕、DRM、低延迟直播等能力。

## 何时使用

- 需要在桌面 Chrome/Firefox/Edge 播放 HLS → 用 hls.js
- 跨平台播放 MPEG-DASH → 用 dash.js（Safari 不原生支持 DASH）
- 需要 ABR（自适应码率）、多音轨、多字幕、CEA-608/708 字幕、低延迟 HLS
- 需要与 EME/DRM（Widevine、PlayReady、FairPlay）集成
- iOS Safari：使用原生 `<video src="*.m3u8">`，hls.js 不可用（Safari 不暴露 MSE）

对于简单的非自适应 MP4，直接用原生 `<video>` 即可，不需要这些库。

## 基础用法

### hls.js 最小示例

```html
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<video id="video" controls></video>
<script>
  const video = document.getElementById('video');
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource('https://example.com/playlist.m3u8');
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari 原生 HLS
    video.src = 'https://example.com/playlist.m3u8';
  }
</script>
```

### 能力检测

- `Hls.isSupported()`：MSE + 基线编解码器都可用
- `Hls.isMSESupported()`：仅检查 MSE，不校验 codec
- `Hls.getMediaSource().isTypeSupported('video/mp4;codecs="av01.0.01M.08"')`：探测具体 codec

## 关键 API

### 实例方法（hls.js）

| API | 用途 |
|-----|------|
| `new Hls(config?)` | 构造实例，可传配置 |
| `hls.attachMedia(video)` / `hls.detachMedia()` | 绑定/解绑 `<video>` |
| `hls.loadSource(url)` | 加载 m3u8 清单 |
| `hls.startLoad(startPosition=-1)` / `hls.stopLoad()` | 控制分片加载（配 `autoStartLoad:false`） |
| `hls.pauseBuffering()` / `hls.resumeBuffering()` | 暂停/恢复缓冲预取 |
| `hls.recoverMediaError()` | 媒体解码错误后恢复 |
| `hls.swapAudioCodec()` | 处理 HE-AAC/AAC 异常（不推荐） |
| `hls.destroy()` | 释放资源，切源前必须调用 |
| `hls.on/off/once(Hls.Events.X, cb)` | 事件订阅 |

### 实例属性

- `hls.levels` / `hls.currentLevel` / `hls.nextLevel` / `hls.loadLevel`：码率级别（`-1` 即 auto）
- `hls.autoLevelCapping`：ABR 上限级别索引
- `hls.bandwidthEstimate`：当前带宽估算
- `hls.audioTracks` / `hls.audioTrack`：音轨列表/当前
- `hls.subtitleTracks` / `hls.subtitleTrack` / `hls.subtitleDisplay`：字幕
- `hls.liveSyncPosition` / `hls.latency` / `hls.targetLatency`：直播延迟
- `hls.interstitialsManager`：HLS Interstitial 广告

### 高频事件（`Hls.Events.*`）

- `MEDIA_ATTACHED`：video 绑定完成
- `MANIFEST_PARSED`：`{ levels, firstLevel, audioTracks, subtitleTracks }`，此时可 `play()`
- `LEVEL_SWITCHED`：`{ level }`，ABR 切换后
- `FRAG_LOADED` / `FRAG_BUFFERED`：分片进度
- `ERROR`：`{ type, details, fatal }`，见下方错误恢复
- `AUDIO_TRACK_SWITCHED` / `SUBTITLE_TRACK_SWITCH`
- `NON_NATIVE_TEXT_TRACKS_FOUND` / `CUES_PARSED`：`renderTextTracksNatively:false` 时自渲染字幕

### 常用配置

```js
new Hls({
  autoStartLoad: true,          // 默认 true，MANIFEST_PARSED 后自动加载
  startPosition: -1,
  maxBufferLength: 30,          // 秒
  maxBufferSize: 60 * 1024 * 1024,
  backBufferLength: Infinity,
  capLevelToPlayerSize: false,  // 按播放器尺寸限制 ABR
  lowLatencyMode: true,         // 低延迟 HLS
  enableWorker: true,
  // ABR EWMA 参数
  abrEwmaFastLive: 3.0, abrEwmaSlowLive: 9.0,
  abrEwmaDefaultEstimate: 500000,
  // 加载策略（新版，取代 fragLoadingTimeOut 等旧参数）
  fragLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 9000,
      maxLoadTimeMs: 100000,
      timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
      errorRetry:   { maxNumRetry: 5, retryDelayMs: 3000, maxRetryDelayMs: 15000, backoff: 'linear' },
    },
  },
  // EME/DRM
  emeEnabled: false,
  drmSystems: {},
  licenseXhrSetup: undefined,
  // 字幕
  enableWebVTT: true, enableIMSC1: true, enableCEA708Captions: true,
  renderTextTracksNatively: true,
  // 自定义网络层
  xhrSetup: (xhr, url) => xhr.setRequestHeader('X-Token', 't'),
  loader: CustomLoader,
});
```

### 错误恢复范式

```js
hls.on(Hls.Events.ERROR, (_, data) => {
  if (!data.fatal) return;  // 非 fatal hls.js 会自行重试
  switch (data.type) {
    case Hls.ErrorTypes.MEDIA_ERROR:
      hls.recoverMediaError();  // 限流：两次间隔应 >5s，避免死循环
      break;
    case Hls.ErrorTypes.NETWORK_ERROR:
      // 重试策略已耗尽，不要直接重启，调整 *LoadPolicy 后再试
      break;
    default:
      hls.destroy();
  }
});
```

### dash.js 最小示例

```html
<script src="https://cdn.dashjs.org/latest/dash.all.min.js"></script>
<video id="video" controls></video>
<script>
  const player = dashjs.MediaPlayer().create();
  player.initialize(document.querySelector('#video'), 'https://example.com/manifest.mpd', true);
</script>
```

dash.js 5.x 与 4.x 在构建产物（UMD legacy/modern + ESM）、配置与 API 上均有破坏性变更，升级需查 migration guide。

## 注意事项

- **Safari**：不支持 MSE，只能用原生 HLS；iOS 上 hls.js `isSupported()` 返回 false，走 `video.canPlayType('application/vnd.apple.mpegurl')` 分支
- **切源**：切换到新 URL 前建议先 `hls.destroy()` 重建实例，或至少 `stopLoad()` → `loadSource()` → `startLoad()`
- **ESM/webpack 打包**：需显式设置 `workerPath` 才能启用 web worker
- **MEDIA_ERROR 恢复限流**：`recoverMediaError` 连续调用会死循环，至少相隔 5s
- **字幕自渲染**：`renderTextTracksNatively:false` 时，必须监听 `NON_NATIVE_TEXT_TRACKS_FOUND` + `CUES_PARSED` 自行渲染
- **deprecated 参数**：`fragLoadingTimeOut`、`fragLoadingMaxRetry`、`liveBackBufferLength`、`lowBufferWatchdogPeriod` 等已被 `*LoadPolicy`/`detectStallWithCurrentTimeMs`/`backBufferLength` 取代
- **低延迟 HLS (LL-HLS)**：`lowLatencyMode: true` 配合 `liveSyncDuration`、`maxLiveSyncPlaybackRate` 控制追帧速率
- **CMCD**：通过 `cmcd` 配置项自动上报 Common Media Client Data

## 组合提示

- 与 `video-player-drm` 搭配：通过 `emeEnabled + drmSystems + licenseXhrSetup` 接 Widevine/PlayReady/FairPlay
- 与 `video-player-subtitles` 搭配：`enableWebVTT/IMSC1/CEA708Captions` 控制解析；原生渲染走 `<track>`，自渲染走 `CUES_PARSED`
- ABR 定制：实现 `abrController` 类（需 `destroy()` 方法），或用 `autoLevelCapping` 粗粒度限制
