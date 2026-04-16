---
name: nextjs-video-server
description: "Next.js 服务端视频处理全栈方案：Route Handler 视频流、Mux 服务端 API、上传处理、HLS 转码、后台任务队列、部署架构选型。"
tech_stack: [nextjs, frontend]
language: [typescript]
---

# Next.js 服务端视频处理（后端方案）

> 来源：Next.js 官方文档、Mux Node SDK、BullMQ 文档、Inngest 文档、FFmpeg 社区最佳实践
> 版本基准：Next.js 15.x / App Router / mux-node-sdk v9.x

## 用途

在 Next.js 应用的服务端实现视频流式传输、上传处理、HLS 转码、任务队列编排以及安全分发，覆盖从"用户上传原始视频"到"观众观看自适应码率流"的完整后端链路。

## 何时使用

- 需要在 Next.js Route Handler 中实现视频流式传输（支持 Range 请求 / 断点续传）
- 需要对接 Mux 等云端视频处理服务的服务端 API
- 需要处理大文件上传（Server Actions / Tus 协议 / busboy 流式处理）
- 需要在服务端用 FFmpeg 生成 HLS 分片、缩略图、提取元数据
- 需要后台任务队列（BullMQ / Inngest）编排视频转码工作流
- 需要根据 Vercel 部署限制选择合适的视频处理架构

---

## 1. Route Handlers 视频流

### 最小示例：支持 Range 请求的视频流

```typescript
// app/api/video/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stat, createReadStream } from 'fs';
import { promisify } from 'util';
import path from 'path';

const fsStat = promisify(stat);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const videoPath = path.join(process.cwd(), 'videos', `${id}.mp4`);

  const fileStat = await fsStat(videoPath);
  const fileSize = fileStat.size;

  const range = request.headers.get('range');

  if (range) {
    // --- 206 Partial Content（Safari 强制要求）---
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    // 限制单次分块大小（推荐 1~5 MB）
    const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB
    const end = Math.min(
      parts[1] ? parseInt(parts[1], 10) : start + CHUNK_SIZE - 1,
      fileSize - 1
    );
    const contentLength = end - start + 1;

    const stream = createReadStream(videoPath, { start, end });

    // Node.js ReadStream -> Web ReadableStream 转换
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
    });

    return new Response(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(contentLength),
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  // --- 200 完整响应（首次请求 / 不支持 Range 的客户端）---
  const stream = createReadStream(videoPath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    },
  });
}
```

### 关键要点

- **Safari 强制要求 Range 支持**：Safari 发起视频请求时只接受 206 Partial Content，如果服务端返回 200 + 完整文件，Safari 不会播放
- **必须设置的响应头**：`Content-Range`、`Accept-Ranges: bytes`、`Content-Type`、`Content-Length`
- **分块大小**：建议 1~5 MB，太大浪费带宽（seek 时丢弃未播放部分），太小增加请求次数
- **Node.js Stream -> Web Stream**：Next.js Route Handler 使用 Web API 的 `Response`，需要将 Node.js 的 `ReadStream` 转换为 Web `ReadableStream`
- **必须使用 Node.js Runtime**：视频流处理需要文件系统访问，在 route.ts 中声明：

```typescript
export const runtime = 'nodejs'; // 默认值，显式声明更清晰
```

---

## 2. Mux 服务端 API 集成

### 安装

```bash
npm install @mux/mux-node
```

### 环境变量

```env
MUX_TOKEN_ID=your-token-id
MUX_TOKEN_SECRET=your-token-secret
MUX_SIGNING_KEY=your-signing-key        # 签名播放 URL 时需要
MUX_SIGNING_PRIVATE_KEY=your-private-key # Base64 编码的私钥
MUX_WEBHOOK_SECRET=your-webhook-secret   # Webhook 签名验证
```

### 初始化客户端

```typescript
// lib/mux.ts
import Mux from '@mux/mux-node';

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export default mux;
```

### 创建 Asset（服务端上传）

```typescript
// app/api/mux/upload/route.ts
import mux from '@/lib/mux';

export async function POST(request: Request) {
  const { videoUrl } = await request.json();

  const asset = await mux.video.assets.create({
    input: [{ url: videoUrl }],
    playback_policy: ['public'],
    // 可选：生成字幕
    // input: [
    //   { url: videoUrl },
    //   { url: subtitleUrl, type: 'text', text_type: 'subtitles', language_code: 'en' }
    // ],
  });

  return Response.json({
    assetId: asset.id,
    playbackId: asset.playback_ids?.[0]?.id,
    status: asset.status, // 'preparing' -> 'ready'
  });
}
```

### Direct Uploads（客户端直传，推荐）

两步流程：服务端创建上传 URL -> 客户端直接上传到 Mux。

```typescript
// 步骤 1：服务端创建 upload URL
// app/api/mux/upload-url/route.ts
import mux from '@/lib/mux';

export async function POST() {
  const upload = await mux.video.uploads.create({
    cors_origin: process.env.NEXT_PUBLIC_APP_URL || '*',
    new_asset_settings: {
      playback_policy: ['public'],
      encoding_tier: 'baseline', // 'baseline' 或 'smart'（更高质量）
    },
  });

  return Response.json({
    uploadId: upload.id,
    uploadUrl: upload.url, // 客户端用此 URL 上传
  });
}
```

```typescript
// 步骤 2：客户端直传（使用 @mux/upchunk 或 tus-js-client）
// components/VideoUploader.tsx
'use client';
import UpChunk from '@mux/upchunk';

function uploadVideo(file: File, uploadUrl: string) {
  const upload = UpChunk.createUpload({
    endpoint: uploadUrl,
    file,
    chunkSize: 30720, // 30MB 分块
  });

  upload.on('progress', (progress) => {
    console.log(`上传进度: ${progress.detail}%`);
  });

  upload.on('success', () => {
    console.log('上传完成，等待 Mux 转码...');
  });

  upload.on('error', (err) => {
    console.error('上传失败:', err.detail);
  });
}
```

### JWT 签名播放 URL

```typescript
// lib/mux-token.ts
import jwt from 'jsonwebtoken';

export function generateMuxPlaybackToken(playbackId: string) {
  const signingKey = Buffer.from(
    process.env.MUX_SIGNING_PRIVATE_KEY!,
    'base64'
  );

  return jwt.sign(
    {
      sub: playbackId,
      aud: 'v', // 'v' = video, 't' = thumbnail, 'g' = gif, 's' = storyboard
      exp: Math.floor(Date.now() / 1000) + 7200, // 2 小时过期
      kid: process.env.MUX_SIGNING_KEY!,
    },
    signingKey,
    { algorithm: 'RS256' }
  );
}

// 使用
// const token = generateMuxPlaybackToken('PLAYBACK_ID');
// const signedUrl = `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
```

### Webhook 处理

```typescript
// app/api/mux/webhook/route.ts
import { headers } from 'next/headers';
import Mux from '@mux/mux-node';

const mux = new Mux();

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('mux-signature')!;

  // 验证签名
  const isValid = mux.webhooks.verifySignature(
    body,
    { 'mux-signature': signature },
    process.env.MUX_WEBHOOK_SECRET!
  );

  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(body);

  switch (event.type) {
    case 'video.asset.ready':
      // 转码完成，更新数据库
      const { id, playback_ids, duration } = event.data;
      // await db.video.update({ assetId: id, status: 'ready', ... });
      break;

    case 'video.asset.errored':
      // 转码失败
      // await db.video.update({ assetId: event.data.id, status: 'error' });
      break;

    case 'video.upload.asset_created':
      // Direct Upload 创建了新 asset
      break;

    case 'video.asset.live_stream_completed':
      // 直播结束，录像可用
      break;
  }

  return new Response('OK', { status: 200 });
}
```

---

## 3. 视频上传处理

### Server Actions 文件上传（Next.js 15）

```typescript
// app/actions/upload.ts
'use server';

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function uploadVideo(formData: FormData) {
  const file = formData.get('video') as File;
  if (!file || file.size === 0) {
    return { error: '请选择视频文件' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadDir, { recursive: true });

  const filename = `${Date.now()}-${file.name}`;
  const filepath = path.join(uploadDir, filename);
  await writeFile(filepath, buffer);

  return { success: true, filename };
}
```

### next.config 大文件配置

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb', // Server Actions 默认 1MB，视频需要调大
    },
  },
};

export default nextConfig;
```

**Route Handler 不受 bodyParser 限制**：Route Handler 直接接收 Web Request，没有默认 body 大小限制（但 Vercel 有平台限制，见第 6 节）。

### busboy 流式处理大文件（Route Handler）

```typescript
// app/api/upload/route.ts
import { Writable } from 'stream';
import Busboy from 'busboy';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';

  return new Promise<Response>((resolve) => {
    const busboy = Busboy({
      headers: { 'content-type': contentType },
      limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    });

    busboy.on('file', (fieldname, fileStream, { filename, mimeType }) => {
      const chunks: Buffer[] = [];
      fileStream.on('data', (chunk) => chunks.push(chunk));
      fileStream.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        // 保存到磁盘或上传到 S3/R2...
        resolve(Response.json({ filename, size: buffer.length }));
      });
    });

    // 将 Web ReadableStream 灌入 busboy
    const reader = request.body!.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { busboy.end(); return; }
      busboy.write(value);
      await pump();
    };
    pump();
  });
}
```

### Tus 协议可恢复上传（搭配 Uppy）

```bash
npm install @uppy/core @uppy/tus @uppy/dashboard
# 服务端：npm install tus-node-server（自托管时）
```

```typescript
// 客户端：Uppy + Tus 上传
'use client';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { Dashboard } from '@uppy/react';
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';

const uppy = new Uppy({
  restrictions: {
    maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
    allowedFileTypes: ['video/*'],
    maxNumberOfFiles: 1,
  },
}).use(Tus, {
  endpoint: '/api/tus', // 指向 Next.js Route Handler 或独立 Tus 服务
  chunkSize: 50 * 1024 * 1024, // 50MB 分块
  retryDelays: [0, 1000, 3000, 5000],
});

export function VideoUploader() {
  return <Dashboard uppy={uppy} proudlyDisplayPoweredByUppy={false} />;
}
```

---

## 4. HLS 生成与分发

### FFmpeg 生成 HLS 分片

```bash
# 单分辨率 HLS
ffmpeg -i input.mp4 \
  -codec: copy \
  -start_number 0 \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_filename 'output/segment_%03d.ts' \
  -f hls \
  output/playlist.m3u8

# 自适应码率（ABR）多分辨率
ffmpeg -i input.mp4 \
  -filter_complex "[0:v]split=3[v1][v2][v3]; \
    [v1]scale=1920:1080[v1out]; \
    [v2]scale=1280:720[v2out]; \
    [v3]scale=854:480[v3out]" \
  -map "[v1out]" -map 0:a -c:v:0 libx264 -b:v:0 5000k -c:a aac -b:a:0 192k \
    -hls_time 6 -hls_list_size 0 \
    -hls_segment_filename 'output/1080p_%03d.ts' output/1080p.m3u8 \
  -map "[v2out]" -map 0:a -c:v:1 libx264 -b:v:1 2800k -c:a aac -b:a:1 128k \
    -hls_time 6 -hls_list_size 0 \
    -hls_segment_filename 'output/720p_%03d.ts' output/720p.m3u8 \
  -map "[v3out]" -map 0:a -c:v:2 libx264 -b:v:2 1400k -c:a aac -b:a:2 96k \
    -hls_time 6 -hls_list_size 0 \
    -hls_segment_filename 'output/480p_%03d.ts' output/480p.m3u8
```

**Master Playlist（手动创建或 ffmpeg 生成）**：

```m3u8
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5192000,RESOLUTION=1920x1080
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2928000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1496000,RESOLUTION=854x480
480p.m3u8
```

### Node.js 中调用 FFmpeg

**方案 A：child_process.spawn（推荐）**

```typescript
// lib/ffmpeg.ts
import { spawn } from 'child_process';

export function transcodeToHLS(
  inputPath: string,
  outputDir: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-codec:', 'copy',
      '-start_number', '0',
      '-hls_time', '6',
      '-hls_list_size', '0',
      '-hls_segment_filename', `${outputDir}/segment_%03d.ts`,
      '-f', 'hls',
      `${outputDir}/playlist.m3u8`,
    ]);

    ffmpeg.stderr.on('data', (data) => {
      // FFmpeg 进度信息输出到 stderr（不是错误）
      console.log(`ffmpeg: ${data}`);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}
```

**方案 B：fluent-ffmpeg（便捷但已归档）**

```bash
npm install fluent-ffmpeg
npm install -D @types/fluent-ffmpeg
```

```typescript
import ffmpeg from 'fluent-ffmpeg';

// 生成缩略图
function generateThumbnail(
  inputPath: string,
  outputPath: string,
  timestamp: string = '00:00:05'
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [timestamp],
        filename: 'thumbnail.jpg',
        folder: outputPath,
        size: '1280x720',
      })
      .on('end', resolve)
      .on('error', reject);
  });
}

// 提取视频元数据
function getVideoMetadata(inputPath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  codec: string;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(
        (s) => s.codec_type === 'video'
      );
      resolve({
        duration: metadata.format.duration ?? 0,
        width: videoStream?.width ?? 0,
        height: videoStream?.height ?? 0,
        codec: videoStream?.codec_name ?? 'unknown',
      });
    });
  });
}
```

> **注意**：fluent-ffmpeg 已于 2025 年 5 月归档（archived），不再维护。新项目建议直接使用 `child_process.spawn` 调用 ffmpeg 命令行。已有项目可继续使用，但应制定迁移计划。

### 提取视频元数据（纯 spawn 方案）

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function getVideoInfo(filePath: string) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  const probe = JSON.parse(stdout);
  const video = probe.streams.find((s: any) => s.codec_type === 'video');

  return {
    duration: parseFloat(probe.format.duration),
    width: video?.width,
    height: video?.height,
    codec: video?.codec_name,
    bitrate: parseInt(probe.format.bit_rate, 10),
    size: parseInt(probe.format.size, 10),
  };
}
```

---

## 5. 后台任务队列

### BullMQ + Redis（自托管推荐）

```bash
npm install bullmq ioredis
```

```typescript
// lib/queue.ts
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null, // BullMQ 要求
});

// --- 定义队列 ---
export const videoQueue = new Queue('video-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 }, // 24h 后清理
    removeOnFail: { age: 604800 },    // 7 天后清理
  },
});

// --- 添加任务 ---
export async function enqueueTranscodeJob(videoId: string, inputPath: string) {
  await videoQueue.add(
    'transcode',
    { videoId, inputPath },
    {
      priority: 1,     // 数字越小优先级越高
      jobId: videoId,  // 防重复
    }
  );
}

// --- Worker（独立进程或独立服务中运行）---
const worker = new Worker(
  'video-processing',
  async (job: Job) => {
    const { videoId, inputPath } = job.data;

    // 1. 更新状态为"转码中"
    await job.updateProgress(10);

    // 2. 执行转码
    await transcodeToHLS(inputPath, `/output/${videoId}`);
    await job.updateProgress(80);

    // 3. 上传到 CDN / S3
    // await uploadToCDN(...)
    await job.updateProgress(100);

    return { videoId, status: 'ready' };
  },
  {
    connection,
    concurrency: 2, // 同时处理 2 个任务
  }
);

worker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});
```

**BullMQ Flows（依赖任务编排）**：

```typescript
import { FlowProducer } from 'bullmq';

const flowProducer = new FlowProducer({ connection });

// 上传 → [转码 1080p + 转码 720p + 转码 480p] → 合并 master playlist
await flowProducer.add({
  name: 'create-master-playlist',
  queueName: 'video-processing',
  data: { videoId: '123' },
  children: [
    {
      name: 'transcode-1080p',
      queueName: 'video-processing',
      data: { videoId: '123', resolution: '1080p' },
    },
    {
      name: 'transcode-720p',
      queueName: 'video-processing',
      data: { videoId: '123', resolution: '720p' },
    },
    {
      name: 'transcode-480p',
      queueName: 'video-processing',
      data: { videoId: '123', resolution: '480p' },
    },
  ],
});
```

### Inngest（Serverless 环境推荐）

```bash
npm install inngest
```

```typescript
// lib/inngest.ts
import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'my-video-app' });
```

```typescript
// inngest/functions/transcode.ts
import { inngest } from '@/lib/inngest';

export const transcodeVideo = inngest.createFunction(
  {
    id: 'transcode-video',
    retries: 3,
    concurrency: { limit: 5 },
  },
  { event: 'video/uploaded' },
  async ({ event, step }) => {
    const { videoId, inputUrl } = event.data;

    // 步骤 1：调用外部转码服务
    const result = await step.run('call-transcode-api', async () => {
      const res = await fetch('https://transcode-service.example.com/api/job', {
        method: 'POST',
        body: JSON.stringify({ input: inputUrl, outputs: ['1080p', '720p', '480p'] }),
      });
      return res.json();
    });

    // 步骤 2：等待转码完成（轮询或等待事件）
    const completed = await step.waitForEvent('video/transcode-complete', {
      timeout: '30m',
      match: 'data.jobId',
    });

    // 步骤 3：更新数据库
    await step.run('update-database', async () => {
      // await db.video.update({ id: videoId, status: 'ready', hlsUrl: completed.data.hlsUrl });
    });

    return { videoId, status: 'ready' };
  }
);
```

```typescript
// app/api/inngest/route.ts
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest';
import { transcodeVideo } from '@/inngest/functions/transcode';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [transcodeVideo],
});
```

```typescript
// 触发工作流（上传完成后）
await inngest.send({
  name: 'video/uploaded',
  data: { videoId: '123', inputUrl: 'https://s3.example.com/raw/video.mp4' },
});
```

### 转码任务架构模式

```
用户上传 → Route Handler / Server Action
  → 保存到临时存储（S3/Blob）
  → 入队（BullMQ.add / inngest.send）
  → Worker 消费任务
    → FFmpeg 转码 HLS（或调用 Mux/云服务）
    → 上传分片到 CDN
  → 回调/Webhook → 更新数据库状态
  → 前端轮询/SSE/WebSocket 获取进度
```

---

## 6. Vercel 部署限制与架构选型

### Vercel 平台限制

| 限制项 | Hobby | Pro | Enterprise |
|--------|-------|-----|-----------|
| Serverless 函数超时 | 60s | 300s | 900s |
| 响应体大小 | 4.5 MB | 4.5 MB | 4.5 MB |
| 请求体大小 | 4.5 MB | 4.5 MB | 4.5 MB |
| Edge 函数超时 | 25s | 25s | 25s |

> **关键限制**：4.5 MB 响应体大小意味着 Vercel 上不能通过 Route Handler 直接流式传输视频文件。必须使用 CDN URL 或签名 URL 让客户端直接从存储服务获取视频。

### Edge Runtime vs Node.js Runtime

| 特性 | Edge Runtime | Node.js Runtime |
|------|-------------|-----------------|
| 冷启动 | 极快 | 较慢 |
| 文件系统 | 不可用 | 可用 |
| child_process | 不可用 | 可用 |
| Node.js Stream | 不可用 | 可用 |
| 适用场景 | JWT 验证、URL 重写、签名 URL 生成 | 视频流、FFmpeg 调用、文件处理 |

### 推荐架构方案

**方案 A：自托管 + BullMQ（完全控制）**

```
客户端 → Next.js API（自托管 VPS/容器）
  → 保存到本地磁盘或 S3
  → BullMQ + Redis 入队
  → FFmpeg Worker 转码
  → 上传 HLS 分片到 CDN/S3
  → 通过 Route Handler 或 CDN 分发
```

适用：需要完全控制转码流程、大量视频、成本敏感。

**方案 B：Vercel + Inngest + 外部转码（Serverless 友好）**

```
客户端 → Mux Direct Upload / 直传 S3
  → Webhook / Inngest Event 触发
  → Inngest 工作流编排
    → 调用外部转码服务（AWS MediaConvert / 独立 FFmpeg 服务）
  → 转码结果存入 S3/R2
  → CDN 签名 URL 分发
```

适用：部署在 Vercel、不想管服务器、视频处理量中等。

**方案 C：SaaS 最小化（Mux 全托管）**

```
客户端 → Mux Direct Upload（上传直达 Mux）
  → Mux 自动转码 + CDN 分发
  → Webhook 回调更新数据库
  → 前端使用 Mux Playback URL
```

适用：快速上线、视频是辅助功能而非核心、愿意为 Mux 按量付费。

---

## 7. 视频安全

### 签名 URL（HMAC）

```typescript
// lib/signed-url.ts
import crypto from 'crypto';

export function generateSignedUrl(
  videoPath: string,
  expiresInSeconds: number = 3600
): string {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const secret = process.env.VIDEO_URL_SECRET!;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${videoPath}:${expires}`)
    .digest('hex');

  return `/api/video/${videoPath}?expires=${expires}&signature=${signature}`;
}

// 验证签名
export function verifySignedUrl(
  videoPath: string,
  expires: string,
  signature: string
): boolean {
  const secret = process.env.VIDEO_URL_SECRET!;

  if (parseInt(expires) < Math.floor(Date.now() / 1000)) {
    return false; // 已过期
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${videoPath}:${expires}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

### CDN 缓存配置

```typescript
// Route Handler 中设置缓存头
return new Response(stream, {
  headers: {
    'Cache-Control': 'public, max-age=31536000, immutable', // HLS 分片可长期缓存
    'CDN-Cache-Control': 'public, max-age=31536000',        // CDN 层缓存
    'Vary': 'Range',                                         // Range 请求变体缓存
  },
});
```

### 防盗链策略

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/video/')) {
    const referer = request.headers.get('referer');
    const allowedOrigins = ['https://yourdomain.com', 'https://www.yourdomain.com'];

    if (referer && !allowedOrigins.some((origin) => referer.startsWith(origin))) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/video/:path*',
};
```

---

## 关键 API（摘要）

- `new Response(webStream, { status: 206, headers })` -- Route Handler 流式响应 + Range 支持
- `createReadStream(path, { start, end })` -- Node.js 分块读取文件
- `mux.video.assets.create({ input, playback_policy })` -- Mux 创建视频资产
- `mux.video.uploads.create({ cors_origin, new_asset_settings })` -- Mux Direct Upload URL
- `mux.webhooks.verifySignature(body, headers, secret)` -- Mux Webhook 签名验证
- `new Queue(name, { connection })` / `videoQueue.add(name, data)` -- BullMQ 创建队列 / 添加任务
- `new Worker(name, handler, { connection, concurrency })` -- BullMQ Worker 消费任务
- `inngest.createFunction({ id }, { event }, handler)` -- Inngest 持久化工作流
- `spawn('ffmpeg', args)` -- Node.js 调用 FFmpeg 转码
- `execFile('ffprobe', args)` -- 提取视频元数据

## 注意事项

- **Safari Range 请求**：Safari 播放视频时强制要求 206 Partial Content 响应，返回 200 会导致播放失败，这是最常见的坑
- **Vercel 4.5 MB 响应体限制**：Vercel 上不能通过 Route Handler 直接流式传输视频，必须使用 CDN URL 重定向或签名 URL 直链
- **fluent-ffmpeg 已归档**：该库于 2025 年 5 月被归档，新项目应使用 `child_process.spawn` 直接调用 ffmpeg
- **Worker 不能在 Serverless 函数中运行**：BullMQ Worker 是长驻进程，不适合 Vercel Serverless。Vercel 上应使用 Inngest 或外部 Worker 服务
- **Server Actions bodySize 默认 1 MB**：上传视频时必须在 next.config 中配置 `serverActions.bodySizeLimit`，否则大文件上传会报 413 错误
- **Direct Upload 优于服务端中转**：大文件应让客户端直传到 Mux/S3，避免视频数据经过 Next.js 服务端中转浪费带宽和时间
- **FFmpeg 需要系统安装**：`child_process.spawn('ffmpeg', ...)` 要求服务器上已安装 FFmpeg，Docker 部署时在 Dockerfile 中 `apt-get install ffmpeg`
- **Redis 连接配置**：BullMQ 要求 `maxRetriesPerRequest: null`，否则连接超时后任务会丢失
- **Webhook 签名验证**：生产环境必须验证 Mux Webhook 签名，防止伪造请求。验证失败直接返回 401
- **timingSafeEqual 防时序攻击**：签名 URL 验证时必须使用 `crypto.timingSafeEqual`，不要用 `===` 比较

## 组合提示

- 与 `next-video` skill 配合：next-video 负责前端播放器组件，本 skill 负责后端视频处理链路
- 与 `react-player` skill 配合：react-player 作为前端播放器消费本 skill 生成的 HLS 流
- 与 `nextjs-core` 配合理解 App Router / Route Handler / Server Actions 基础
- 与 `nextjs-deployment-config` 配合处理 Vercel 部署限制和环境变量配置
