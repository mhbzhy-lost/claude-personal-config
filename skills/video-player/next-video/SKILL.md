---
name: next-video
description: "next-video v2.x：Next.js 视频优化组件，类 next/image 体验，自动转码、自适应码率、海报图生成，支持 Mux/S3/R2/Vercel Blob 等多后端。"
tech_stack: [nextjs, react, frontend]
language: [typescript]
capability: [media-processing]
---

# next-video（Next.js 视频优化组件）

> 来源：https://github.com/muxinc/next-video
> https://next-video.dev/docs
> 版本基准：next-video v2.7.x（Mux 出品）

## 用途

为 Next.js 提供类似 `next/image` 的视频组件开发体验，自动处理视频转码、自适应码率（HLS/DASH）、海报图生成、lazy loading 等优化，同时支持多种存储后端。

## 何时使用

- Next.js 项目中需要嵌入自托管或云端视频，且希望自动优化
- 需要自适应码率流媒体（HLS/DASH）而不想手动搭建转码流水线
- 需要背景视频、直播流播放等场景
- 需要自定义播放器主题外观
- 已有 Mux 账户，希望无缝集成视频托管与分析

---

## 安装与初始化

```bash
npm install next-video

# 初始化：创建 /videos 目录、更新 .gitignore、生成配置
npx next-video init
```

### next.config 配置

```js
// next.config.mjs (ESM)
import { withNextVideo } from 'next-video/withNextVideo.js';

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withNextVideo(nextConfig);
```

```js
// next.config.js (CJS)
const { withNextVideo } = require('next-video/withNextVideo');

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withNextVideo(nextConfig);
```

### 环境变量（Mux 托管时必需）

```env
MUX_TOKEN_ID=your-token-id
MUX_TOKEN_SECRET=your-token-secret
```

---

## 基础用法

### 本地视频（/videos 目录约定）

```tsx
import Video from 'next-video';
import myVideo from '/videos/my-video.mp4';

export default function Page() {
  return <Video src={myVideo} />;
}
```

**关键约定**：将视频文件放入项目根 `/videos` 目录后，`next-video` 自动为每个视频生成 `[filename].json` 元数据文件（包含转码状态、播放 URL、海报图等）。这些 JSON 文件应提交到版本控制。

### 远程 URL

```tsx
import Video from 'next-video';

export default function Page() {
  return (
    <Video
      src="https://example.com/video.mp4"
      poster="https://example.com/poster.jpg"
    />
  );
}
```

### HLS/DASH 流

```tsx
<Video src="https://stream.example.com/manifest.m3u8" />
```

---

## Video 组件 Props API

### 通用 Props

| Prop | 类型 | 说明 |
|------|------|------|
| `src` | `string \| StaticImport` | 视频源：本地 import、远程 URL、HLS/DASH 地址 |
| `poster` | `string` | 海报图 URL（本地视频自动生成） |
| `blurDataURL` | `string` | 占位模糊图（本地视频自动生成） |
| `theme` | `string` | 播放器主题（来自 player.style） |
| `as` | `React.ComponentType` | 自定义播放器组件替换默认渲染 |
| `transform` | `function` | 转换视频源参数 |
| `loader` | `string` | 自定义加载器 |

### Mux 专用 Props

| Prop | 类型 | 说明 |
|------|------|------|
| `startTime` | `number` | 起始播放时间（秒） |
| `streamType` | `'on-demand' \| 'live' \| 'll-live'` | 流类型 |
| `customDomain` | `string` | Mux 自定义域名 |
| `envKey` | `string` | Mux Data 环境密钥（分析） |
| `metadataVideoId` | `string` | 分析用视频 ID |
| `metadataTitle` | `string` | 分析用视频标题 |
| `metadataViewerUserId` | `string` | 分析用观众 ID |
| `disableTracking` | `boolean` | 禁用 Mux Data 跟踪 |
| `disableCookies` | `boolean` | 禁用 Cookie |

### 安全播放 Props

| Prop | 类型 | 说明 |
|------|------|------|
| `playbackToken` | `string` | 签名播放令牌 |
| `thumbnailToken` | `string` | 签名缩略图令牌 |
| `drmToken` | `string` | DRM 令牌 |

### 直播 Props

| Prop | 类型 | 说明 |
|------|------|------|
| `targetLiveWindow` | `number` | 直播窗口目标时长 |
| `liveEdgeOffset` | `number` | 直播边缘偏移量 |

Video 组件同时透传所有标准 HTML `<video>` 属性（`autoPlay`、`muted`、`loop`、`controls` 等）。

---

## BackgroundVideo 组件

用于自动播放、静音、循环的装饰性背景视频。

```tsx
import BackgroundVideo from 'next-video/background-video';
import bgVideo from '/videos/background.mp4';

export default function Hero() {
  return (
    <div style={{ position: 'relative', height: '100vh' }}>
      <BackgroundVideo src={bgVideo} />
      <h1 style={{ position: 'relative', zIndex: 1 }}>Welcome</h1>
    </div>
  );
}
```

`BackgroundVideo` 默认设置 `autoPlay`、`muted`、`loop`、`playsInline`，并隐藏控件。

---

## 自定义播放器主题

v2 使用 Media Chrome + player.style 主题系统（替代了 v1 的 Mux Player）。

### 使用预置主题

```bash
npm install @player.style/minimal
```

```tsx
import Video from 'next-video';
import MinimalTheme from '@player.style/minimal/react';

<Video src={myVideo} theme={MinimalTheme} />
```

### CSS 变量定制

```css
/* 覆盖播放器主题颜色 */
media-theme {
  --media-primary-color: #ffffff;
  --media-secondary-color: rgba(0, 0, 0, 0.75);
  --media-accent-color: #ff3366;
}
```

可用的 CSS 变量（通用）：
- `--media-primary-color` -- 图标与文字颜色
- `--media-secondary-color` -- 控件栏背景色
- `--media-accent-color` -- 进度条高亮、焦点色

---

## Provider 配置（存储后端）

### Mux（默认）

```env
MUX_TOKEN_ID=xxx
MUX_TOKEN_SECRET=xxx
```

无需额外 provider 配置，Mux 是默认后端。

### Amazon S3

```js
// next.config.mjs
import { withNextVideo } from 'next-video/withNextVideo.js';

export default withNextVideo(nextConfig, {
  provider: 'amazon-s3',
  providerConfig: {
    'amazon-s3': {
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      bucket: 'my-video-bucket',
    },
  },
});
```

```env
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

### Vercel Blob

```js
export default withNextVideo(nextConfig, {
  provider: 'vercel-blob',
});
```

```env
BLOB_READ_WRITE_TOKEN=xxx
```

### Cloudflare R2

```js
export default withNextVideo(nextConfig, {
  provider: 'cloudflare-r2',
  providerConfig: {
    'cloudflare-r2': {
      endpoint: 'https://<account-id>.r2.cloudflarestorage.com',
      bucket: 'my-videos',
    },
  },
});
```

### Backblaze B2

```js
export default withNextVideo(nextConfig, {
  provider: 'backblaze-b2',
  providerConfig: {
    'backblaze-b2': {
      endpoint: 'https://s3.us-west-001.backblazeb2.com',
      bucket: 'my-videos',
    },
  },
});
```

---

## /videos 目录约定

```
project-root/
├── videos/
│   ├── intro.mp4              # 源视频（被 .gitignore 排除）
│   └── intro.mp4.json         # 元数据（应提交到 git）
```

- `npx next-video init` 自动将 `/videos/*.mp4` 等大文件加入 `.gitignore`
- `npx next-video sync` 手动同步/上传本地视频到远程 provider
- JSON 元数据文件包含：`status`、`playbackId`、`poster`、`blurDataURL`、`sources` 等

---

## 开发 vs 生产模式

v2.7.0 引入 `NODE_ENV` 自动检测：

| 模式 | 行为 |
|------|------|
| `development` | 视频自动上传到 Mux（dev 模式），页面直接播放本地文件作为 fallback |
| `production` | 使用已处理的远程资源（HLS/DASH），海报图和 blurDataURL 已预生成 |

**注意**：开发模式下首次加载本地视频会触发后台上传到 Mux，转码完成后 JSON 元数据自动更新。

---

## 元数据钩子

用于自定义资产处理逻辑：

```js
// next.config.mjs
export default withNextVideo(nextConfig, {
  // 加载资产元数据
  async loadAsset(assetPath) { /* 返回 asset 对象 */ },
  // 保存资产元数据
  async saveAsset(assetPath, asset) { /* 持久化 */ },
  // 更新资产元数据（webhook 回调时）
  async updateAsset(assetPath, asset) { /* 更新状态 */ },
});
```

---

## App Router 和 Pages Router 兼容性

- **App Router**：直接在 Server Component 中使用 `<Video />` 即可（组件内部处理客户端渲染）
- **Pages Router**：同样支持，直接 import 使用

```tsx
// App Router: app/page.tsx
import Video from 'next-video';
import myVideo from '/videos/demo.mp4';

export default function Page() {
  return <Video src={myVideo} />;
}

// Pages Router: pages/index.tsx
import Video from 'next-video';
import myVideo from '/videos/demo.mp4';

export default function Home() {
  return <Video src={myVideo} />;
}
```

---

## Mux Data 分析集成

内置 Mux Data 支持，无需额外配置即可获得视频播放分析。

```tsx
<Video
  src={myVideo}
  envKey="your-mux-data-env-key"
  metadataVideoId="video-123"
  metadataTitle="Product Demo"
  metadataViewerUserId="user-456"
/>
```

- 设置 `disableTracking` 完全禁用分析
- 设置 `disableCookies` 禁用 Cookie（GDPR 合规）

---

## 关键 API（摘要）

- `<Video src poster theme />` -- 核心视频组件，支持本地 import 和远程 URL
- `<BackgroundVideo src />` -- 背景视频（自动 autoplay/muted/loop）
- `withNextVideo(nextConfig, options)` -- next.config 包装函数
- `npx next-video init` -- 初始化项目（创建 /videos 目录、更新 .gitignore）
- `npx next-video sync` -- 同步本地视频到远程 provider
- `provider` 选项 -- `'mux'`（默认）、`'amazon-s3'`、`'vercel-blob'`、`'cloudflare-r2'`、`'backblaze-b2'`
- CSS 变量 -- `--media-primary-color`、`--media-secondary-color`、`--media-accent-color`
- Mux 分析 Props -- `envKey`、`metadataVideoId`、`metadataTitle`、`disableTracking`

## 注意事项

- **v2 架构变更**：v2 从 Mux Player 迁移到 Media Chrome + player.style 主题系统，升级时需替换主题配置
- **ESM 导入路径**：ESM 项目中 `withNextVideo` 需从 `next-video/withNextVideo.js` 导入（注意 `.js` 后缀）
- **大文件 .gitignore**：`npx next-video init` 自动排除视频大文件，但 `.json` 元数据文件必须提交
- **Mux 环境变量必需**：使用 Mux 后端（默认）时，`MUX_TOKEN_ID` 和 `MUX_TOKEN_SECRET` 必须配置，否则上传/转码失败
- **开发模式自动上传**：dev 模式下本地视频会自动上传到 Mux，注意 API 用量
- **`src` 类型差异**：本地视频使用 `import` 语句（获取自动优化），远程 URL 使用字符串（不经过转码）
- **安全播放令牌**：签名 URL 的 `playbackToken`、`thumbnailToken`、`drmToken` 需要服务端生成，不要硬编码在前端
- **直播流必须设置 `streamType`**：播放直播时需显式设置 `streamType="live"` 或 `"ll-live"`
- **`blurDataURL` 仅本地视频自动生成**：远程 URL 需手动提供 `poster` 和 `blurDataURL`

## 组合提示

- 与 `nextjs-core` 配合理解 App Router / Pages Router 项目结构
- 与 `nextjs-optimization` 配合进行整体性能优化（lazy loading 策略）
- 与 `nextjs-deployment-config` 配合处理环境变量和 provider 配置的部署事项
- 与 `nextjs-styling-assets` 配合处理视频组件的样式定制
