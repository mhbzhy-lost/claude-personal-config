---
name: nextjs-deployment-config
description: "Next.js 15 部署与配置：next.config.ts、环境变量、standalone 输出、Vercel 与自托管、图像优化。"
tech_stack: [nextjs, react, frontend]
language: [typescript]
capability: [web-framework, container]
---

# 部署与配置（Next.js 15）

> 来源：https://nextjs.org/docs/app/building-your-application/deploying
> https://nextjs.org/docs/app/building-your-application/configuring

## 用途

把 Next.js 应用上线到 Vercel / 自有服务器 / 容器，正确管理环境变量与输出模式。

## 何时使用

- 准备部署到 Vercel / Node 服务器 / Docker
- 区分 dev / preview / prod 环境变量
- 优化产物体积（standalone）、配置域名重写

## 环境变量

```
# .env                 所有环境加载
# .env.local           仅本地加载（git ignore）
# .env.development     next dev 加载
# .env.production      next start / next build 加载
# .env.test            测试
```

```ts
// 服务器端可用（默认）
process.env.DATABASE_URL;

// 想给浏览器端用，必须 NEXT_PUBLIC_ 前缀
process.env.NEXT_PUBLIC_POSTHOG_KEY;
```

- 只有 `NEXT_PUBLIC_*` 会被打进 client bundle
- 构建时内联：生产环境改变量必须**重新 build**（或通过运行时注入）
- 敏感变量永远不要加 `NEXT_PUBLIC_` 前缀

### 运行时读取服务端变量

```ts
// 始终使用 process.env.X，不要存成模块顶层常量（方便 dotenv 覆盖）
export async function getData() {
  const url = process.env.DATABASE_URL!;
  // ...
}
```

## `next.config.ts`（Next 15 原生支持 TS）

```ts
// next.config.ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',                         // 'standalone' | 'export' | undefined

  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.example.com' }],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },

  async redirects() {
    return [{ source: '/old', destination: '/new', permanent: true }];
  },

  async rewrites() {
    return [{ source: '/api/proxy/:path*', destination: 'https://api.example.com/:path*' }];
  },

  experimental: {
    // ppr: 'incremental',
    // reactCompiler: true,
    // serverActions: { allowedOrigins: ['example.com'] },
  },
};

export default config;
```

## 输出模式

### `output: 'standalone'`（推荐用于自托管 / Docker）

`next build` 后产物：
```
.next/standalone/   # 极小的 server.js + 依赖
.next/static/       # 静态资源（需复制到 standalone/.next/static）
public/             # 也需复制到 standalone/public
```

启动：`node .next/standalone/server.js`

### `output: 'export'`（纯静态站）

```ts
const config: NextConfig = { output: 'export' };
```

产物在 `out/`，可上传到任意静态托管。限制：
- 不支持 RSC 动态能力、Route Handlers（仅 GET 且静态）、middleware、Server Actions、ISR、`next/image` 的默认 loader

## Dockerfile（standalone）

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

## Vercel 部署要点

- 零配置：push 到 git 即可
- 环境变量在 Dashboard 配置，按 Production / Preview / Development 区分
- 自动处理 ISR / Edge / 图像优化
- `vercel.json` 一般不需要（所有配置都走 `next.config.ts`）

## 自托管要点

- 必须跑 `next start`（或 standalone `server.js`），不是 `next dev`
- 反代后端（Nginx / Caddy）要传 `X-Forwarded-Host` / `X-Forwarded-Proto`
- 图像优化默认用 Node 端 `sharp`，确保基础镜像装了它或允许下载
- 需要 ISR 持久化：Next 默认用文件系统缓存；多实例需要 shared cache handler

### 自定义 cache handler（多实例部署）

```ts
// next.config.ts
const config: NextConfig = {
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0,
};
```

## 常用脚本

```json
// package.json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

## 关键 API（摘要）

- `next.config.ts` 字段：`output`、`images`、`headers()`、`redirects()`、`rewrites()`、`experimental`、`cacheHandler`
- 环境变量前缀：`NEXT_PUBLIC_*` 暴露到浏览器
- 命令：`next dev` / `next build` / `next start` / `next lint`

## 常见陷阱

- 在代码里把 `process.env.X` 存成模块顶层常量 → 运行时不能被外部 env 覆盖；总是读 `process.env` 现场
- 以为 `output: 'export'` 能用 RSC 所有特性 → 实际禁用了大半动态能力
- Docker 构建时缺 `sharp` → 生产图片优化失败（报 "sharp not found"）
- Vercel 的 Preview 环境默认用 Production env → 要在面板里为 Preview 单独配置
- 改了 `NEXT_PUBLIC_*` 不重新 build → 老值还在客户端 bundle 里
- `middleware.ts` 用了 Node-only 模块 → 构建通过但运行时在 Edge 报错

## 组合提示

与 `nextjs-middleware`（Edge 限制）、`nextjs-styling-assets`（images 配置）联动。
