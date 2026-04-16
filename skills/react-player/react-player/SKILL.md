---
name: react-player
description: "React 多源视频/音频播放器组件，支持 YouTube/Vimeo/Mux/HLS/DASH/本地文件等，v3 为当前主版本。"
tech_stack: [react, frontend]
language: [typescript, javascript]
---

# ReactPlayer（多源媒体播放器）

> 来源：https://github.com/cookpete/react-player
> 版本基准：react-player v3.4.0（2025 年发布，v2 -> v3 有破坏性变更）

## 用途

在 React 应用中嵌入视频/音频播放器，统一接口支持 YouTube、Vimeo、Mux、Twitch、本地文件、HLS、DASH 等多种媒体源，无需为每种平台编写不同的集成代码。

## 何时使用

- 需要播放 YouTube/Vimeo 等第三方平台视频
- 需要播放自托管的 MP4/WebM/OGG 文件或 HLS/DASH 流
- 需要统一的播放器回调接口（进度、结束、错误等）
- 需要缩略图懒加载（light 模式）减少初始加载
- 需要画中画（PiP）功能

## 安装

```bash
npm install react-player
# 或
yarn add react-player
```

**按需导入（推荐，减小 bundle）**：

```tsx
// 仅加载 YouTube 播放器（不会打包其他平台代码）
import ReactPlayer from 'react-player/youtube';

// 仅加载本地文件播放器
import ReactPlayer from 'react-player/file';
```

**全量导入**：

```tsx
// 包含所有支持的平台（bundle 较大）
import ReactPlayer from 'react-player';
```

## 基础用法

```tsx
import React from 'react';
import ReactPlayer from 'react-player';

function VideoPlayer() {
  return (
    <ReactPlayer
      src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      controls
      playing={false}
      width="100%"
      height="auto"
    />
  );
}
```

**通过 ref 调用实例方法**：

```tsx
import React, { useRef } from 'react';
import ReactPlayer from 'react-player';

function PlayerWithSeek() {
  const playerRef = useRef<ReactPlayer>(null);

  const handleSeek = () => {
    // seekTo(fraction) - 0~1 之间的比例
    // seekTo(seconds, 'seconds') - 精确秒数
    playerRef.current?.seekTo(0.5);
  };

  return (
    <>
      <ReactPlayer ref={playerRef} src="video.mp4" controls />
      <button onClick={handleSeek}>跳到 50%</button>
    </>
  );
}
```

## 关键 Props（摘要）

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `src` | `string \| string[] \| object[]` | 必填 | 媒体 URL（v3 从 `url` 更名） |
| `playing` | `boolean` | `false` | 是否播放 |
| `controls` | `boolean` | `false` | 显示原生控件 |
| `volume` | `number` | `null` | 音量 0~1 |
| `muted` | `boolean` | `false` | 静音 |
| `playbackRate` | `number` | `1` | 播放速率 |
| `loop` | `boolean` | `false` | 循环播放 |
| `width` | `string \| number` | `640px` | 宽度 |
| `height` | `string \| number` | `360px` | 高度 |
| `style` | `object` | `{}` | 外层容器样式 |
| `light` | `boolean \| string` | `false` | 缩略图懒加载，`true` 自动获取，传字符串为自定义缩略图 URL |
| `pip` | `boolean` | `false` | 画中画模式 |
| `playsInline` | `boolean` | `false` | iOS 内联播放 |
| `progressInterval` | `number` | `1000` | `onProgress` 触发间隔（ms） |
| `crossOrigin` | `string` | - | 视频元素的 crossOrigin 属性 |
| `disableRemotePlayback` | `boolean` | `false` | 禁用远程播放按钮 |
| `config` | `object` | `{}` | 各平台特定配置（见下方） |

## 回调事件

| 事件 | 参数 | 说明 |
|------|------|------|
| `onReady` | `player` | 媒体加载完毕，可以播放 |
| `onStart` | - | 首次开始播放 |
| `onPlay` | - | 开始/恢复播放 |
| `onPause` | - | 暂停 |
| `onProgress` | `{ played, playedSeconds, loaded, loadedSeconds }` | 播放进度 |
| `onDurationChange` | `duration` | 时长变化（v3 从 `onDuration` 更名） |
| `onEnded` | - | 播放结束 |
| `onError` | `error, data, hlsInstance, hlsGlobal` | 播放错误 |
| `onWaiting` | - | 缓冲中（v3 从 `onBuffer` 更名） |
| `onSeeking` | `seconds` | 开始 seek（v3 从 `onSeek` 拆分） |
| `onSeeked` | `seconds` | seek 完成（v3 新增） |
| `onRateChange` | `rate` | 播放速率变化 |
| `onTimeUpdate` | `{ played, playedSeconds }` | 时间更新（更高频率的进度） |

## 实例方法（通过 ref）

```tsx
const playerRef = useRef<ReactPlayer>(null);

// 跳转 - 比例模式（默认）
playerRef.current?.seekTo(0.5);        // 跳到 50%

// 跳转 - 秒数模式
playerRef.current?.seekTo(120, 'seconds'); // 跳到 2 分钟

// 获取时长（秒）
playerRef.current?.getDuration();

// 获取当前时间（秒）
playerRef.current?.getCurrentTime();
```

## config 平台特定配置

```tsx
<ReactPlayer
  src="https://www.youtube.com/watch?v=xxx"
  config={{
    youtube: {
      playerVars: {
        showinfo: 1,
        modestbranding: 1,
        rel: 0,
      },
    },
  }}
/>
```

**HLS 流配置**：

```tsx
<ReactPlayer
  src="https://example.com/live/stream.m3u8"
  config={{
    hls: {
      hlsOptions: {
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      },
      // 可传入自定义 hls.js 实例
      // hlsInstance: customHls,
    },
  }}
/>
```

**DASH 流配置**：

```tsx
<ReactPlayer
  src="https://example.com/stream.mpd"
  config={{
    dash: {
      dashOptions: {
        // dash.js MediaPlayer 配置
      },
    },
  }}
/>
```

**Mux 配置**：

```tsx
<ReactPlayer
  src="https://stream.mux.com/PLAYBACK_ID"
  config={{
    mux: {
      // Mux 特定选项
    },
  }}
/>
```

可配置的平台 key：`youtube`、`vimeo`、`mux`、`wistia`、`hls`、`dash`、`file`。

## 多源回退

```tsx
// 传入数组，播放器按顺序尝试，前一个失败自动回退到下一个
<ReactPlayer
  src={[
    'https://example.com/video.webm',
    'https://example.com/video.mp4',
    'https://example.com/video.ogv',
  ]}
/>

// 带 MIME 类型
<ReactPlayer
  src={[
    { src: 'https://example.com/video.webm', type: 'video/webm' },
    { src: 'https://example.com/video.mp4', type: 'video/mp4' },
  ]}
/>
```

## 响应式播放器

**推荐方案（现代 CSS）**：

```tsx
<div style={{ width: '100%', maxWidth: 800 }}>
  <ReactPlayer
    src="video.mp4"
    width="100%"
    height="auto"
    style={{ aspectRatio: '16/9' }}
    controls
  />
</div>
```

**传统 padding 方案（兼容旧浏览器）**：

```tsx
<div style={{ position: 'relative', paddingTop: '56.25%' /* 16:9 */ }}>
  <ReactPlayer
    src="video.mp4"
    width="100%"
    height="100%"
    style={{ position: 'absolute', top: 0, left: 0 }}
    controls
  />
</div>
```

## SSR / Next.js 兼容

react-player 依赖浏览器 API，在 SSR 环境中必须禁用服务端渲染：

```tsx
// Next.js App Router
import dynamic from 'next/dynamic';

const ReactPlayer = dynamic(() => import('react-player'), { ssr: false });

export default function VideoPage() {
  return <ReactPlayer src="video.mp4" controls />;
}
```

**注意**：按需导入路径同样适用于 dynamic import：

```tsx
const ReactPlayer = dynamic(() => import('react-player/youtube'), { ssr: false });
```

## v2 -> v3 迁移指南（破坏性变更）

### Props 重命名

| v2 | v3 | 说明 |
|----|-----|------|
| `url` | `src` | 媒体源地址 |
| `onDuration` | `onDurationChange` | 时长回调 |
| `onBuffer` | `onWaiting` | 缓冲回调 |
| `onBufferEnd` | _(移除)_ | 用 `onPlay` 替代 |
| `onSeek` | `onSeeking` / `onSeeked` | 拆分为开始/完成两个事件 |

### 移除的平台支持

以下平台在 v3 中**不再内置支持**：
- DailyMotion
- SoundCloud
- Streamable
- Twitch
- Facebook
- Mixcloud
- Kaltura

如果项目依赖这些平台，需停留在 v2 或寻找替代方案。

### 迁移步骤

```tsx
// v2
<ReactPlayer url="video.mp4" onDuration={d => setDuration(d)} onBuffer={() => setBuffering(true)} />

// v3 - 更新属性名
<ReactPlayer src="video.mp4" onDurationChange={d => setDuration(d)} onWaiting={() => setBuffering(true)} />
```

## 注意事项

- **自动播放限制**：大多数现代浏览器阻止非静音的自动播放。要实现自动播放需 `playing={true}` + `muted={true}`，待用户交互后再取消静音
- **移动端限制**：iOS 上必须设置 `playsInline` 才能避免全屏播放；某些移动浏览器不允许程序化控制音量
- **light 模式**：开启 `light` 时，播放器显示缩略图而非加载 iframe/视频，点击后才加载真正的播放器，可显著减少初始页面加载时间和带宽
- **HLS/DASH**：react-player 内置了对 hls.js 和 dash.js 的集成，直接传 `.m3u8` 或 `.mpd` URL 即可，无需额外安装；如需特定版本可通过 config 传入自定义实例
- **TypeScript**：主包 `react-player` 有类型定义；按需导入的平台特定包（如 `react-player/youtube`）类型可能不完整，必要时需手动补充类型声明
- **bundle 优化**：生产环境务必使用按需导入（`react-player/youtube` 等），全量导入会包含所有平台的 SDK 加载逻辑
- **`seekTo` 时机**：必须在 `onReady` 触发后才能调用 `seekTo`，否则可能静默失败
- **`onProgress` 性能**：默认每秒触发一次，频繁 setState 可能影响性能，可增大 `progressInterval` 或使用 ref 存储进度值

## 组合提示

- 与 `next/dynamic` 搭配解决 SSR 兼容问题
- 与状态管理库（Zustand/Redux）搭配实现跨组件播放状态同步
- 与 CSS aspect-ratio 或容器查询搭配实现响应式播放器
- HLS 场景可搭配 `hls.js` 的错误恢复策略实现更健壮的直播流播放
