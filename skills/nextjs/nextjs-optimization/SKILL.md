---
name: nextjs-optimization
description: "Next.js 15 性能优化：脚本加载策略、动态导入与懒加载、Bundle 分析、Instrumentation、Web Vitals 监控、Turbopack。"
tech_stack: [nextjs]
---

# Next.js 性能优化

> 来源：https://nextjs.org/docs/app/building-your-application/optimizing
> https://nextjs.org/docs/app/guides/scripts | lazy-loading | package-bundling

## 用途

全面优化 Next.js 应用的加载速度、运行时性能与可观测性。

## 何时使用

- 加载第三方脚本（Analytics、GTM）且不阻塞首屏
- 大组件/库按需加载以减小初始 bundle
- 排查 bundle 体积问题
- 接入 APM/日志/OpenTelemetry 等服务端监控
- 监控 Core Web Vitals 并上报

---

## 1. `next/script` 脚本优化

```tsx
// app/layout.tsx — 全局脚本放 root layout，路由级放对应 layout
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
      {/* afterInteractive（默认）：hydration 后尽早加载 */}
      <Script src="https://example.com/analytics.js" />
      {/* lazyOnload：浏览器空闲时加载 */}
      <Script src="https://example.com/widget.js" strategy="lazyOnload" />
      {/* beforeInteractive：hydration 前加载（仅 root layout） */}
      <Script src="https://example.com/polyfill.js" strategy="beforeInteractive" />
    </html>
  );
}
```

| strategy | 时机 | 典型场景 |
|---|---|---|
| `beforeInteractive` | hydration 前 | polyfill、bot 检测 |
| `afterInteractive` | hydration 后（默认） | Analytics、A/B 测试 |
| `lazyOnload` | 浏览器空闲 | 聊天挂件、低优先级 |
| `worker` | Web Worker（实验性） | 重计算型第三方脚本 |

### 事件回调与内联脚本

```tsx
'use client'; // onLoad/onReady/onError 仅在 Client Component 中生效
import Script from 'next/script';

export default function Page() {
  return (
    <>
      <Script
        src="https://example.com/sdk.js"
        onLoad={() => console.log('加载完成')}
        onReady={() => console.log('就绪，每次挂载触发')}
        onError={(e) => console.error('加载失败', e)}
      />
      {/* 内联脚本必须提供 id 用于去重 */}
      <Script id="init-datalayer">
        {`window.dataLayer = window.dataLayer || [];`}
      </Script>
    </>
  );
}
```

---

## 2. `@next/third-parties` — Google 服务集成

```tsx
// app/layout.tsx — GA 和 GTM 放 root layout 即全局生效
import { GoogleAnalytics, GoogleTagManager } from '@next/third-parties/google';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <GoogleTagManager gtmId="GTM-XXXXXXX" />
      <body>{children}</body>
      <GoogleAnalytics gaId="G-XXXXXXX" />
    </html>
  );
}
// 发送事件：sendGTMEvent({ event: 'purchase', value: 99 })
// 发送事件：sendGAEvent('event', 'click', { value: 'cta' })
// 需从 '@next/third-parties/google' 导入，在 Client Component 中调用
```

---

## 3. 动态导入与懒加载

```tsx
'use client';
import dynamic from 'next/dynamic';

// 基本用法 — 独立 chunk，按需加载
const HeavyChart = dynamic(() => import('@/components/HeavyChart'));

// 禁用 SSR（仅客户端渲染，适用于依赖 window/document 的组件）
const ClientOnlyEditor = dynamic(() => import('@/components/Editor'), { ssr: false });

// 自定义 loading 占位
const Modal = dynamic(() => import('@/components/Modal'), {
  loading: () => <div className="skeleton h-64" />,
});

// 命名导出
const Hello = dynamic(() =>
  import('@/components/hello').then((mod) => mod.Hello)
);
```

### 按需加载外部库与 Server Component 注意

```tsx
'use client';
export default function SearchPage() {
  async function handleSearch(query: string) {
    const Fuse = (await import('fuse.js')).default; // 仅触发时加载
    const fuse = new Fuse(data, { keys: ['name'] });
    setResults(fuse.search(query));
  }
  return <input onChange={(e) => handleSearch(e.target.value)} />;
}
```

Server Component 自动 code split，无需 `dynamic()`。`ssr: false` 仅能在 Client Component 中使用。

---

## 4. Bundle 分析

### Turbopack Bundle Analyzer（v16.1+，实验性）

```bash
npx next experimental-analyze          # 交互式 UI
npx next experimental-analyze --output # 输出到 .next/diagnostics/analyze
```

### `@next/bundle-analyzer`（Webpack）

```js
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
module.exports = withBundleAnalyzer({});
```

```bash
ANALYZE=true npm run build  # 自动打开可视化报告
```

### 优化大 Bundle

```ts
// next.config.ts
import type { NextConfig } from 'next';
const config: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@iconify/react', 'lodash-es'],
  },
  serverExternalPackages: ['sharp', 'pino'], // 排除出服务端 bundle
};
export default config;
```

---

## 5. Instrumentation（服务端初始化）

`instrumentation.ts` 放在项目根目录（或 `src/`），`register()` 在服务启动时执行一次。

```ts
// instrumentation.ts
import { type Instrumentation } from 'next';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerOTel } = await import('@vercel/otel');
    registerOTel('my-app');
  }
}

// Next 15：服务端请求错误钩子
export const onRequestError: Instrumentation.onRequestError = async (
  err, request, context
) => {
  // context.routeType: 'render' | 'route' | 'action' | 'proxy'
  // context.renderType: 'dynamic' | 'dynamic-resume'（PPR）
  await fetch('https://sentry.example.com/report', {
    method: 'POST',
    body: JSON.stringify({
      message: err.message, digest: err.digest,
      path: request.path, routeType: context.routeType,
    }),
  });
};
```

客户端初始化使用 `instrumentation-client.ts`（在前端代码执行前运行）：

```ts
// instrumentation-client.ts
window.addEventListener('error', (event) => reportError(event.error));
```

---

## 6. Web Vitals 监控

```tsx
// app/_components/web-vitals.tsx — 独立 Client Component 避免感染 layout
'use client';
import { useReportWebVitals } from 'next/web-vitals';

export function WebVitals() {
  useReportWebVitals((metric) => {
    // metric.name: 'TTFB' | 'FCP' | 'LCP' | 'FID' | 'CLS' | 'INP'
    const body = JSON.stringify(metric);
    navigator.sendBeacon?.('/api/vitals', body)
      ?? fetch('/api/vitals', { body, method: 'POST', keepalive: true });
  });
  return null;
}
// 在 app/layout.tsx <body> 内引入 <WebVitals />
```

---

## 7. Turbopack

```bash
next dev --turbopack   # 开发模式（Next 15+ 默认）
```

- 增量编译显著提速（Rust 实现）
- `next.config.js` 的 `webpack()` 自定义配置不生效
- 部分 Webpack loader 插件不兼容
- magic comments 用 `turbopackIgnore` / `turbopackOptional` 替代 `webpackIgnore`

---

## 8. 其他优化技巧

```tsx
import Image from 'next/image';
import Link from 'next/link';

// LCP 优化 — 首屏图片加 priority
<Image src="/hero.jpg" alt="hero" width={1200} height={600} priority />

// 预加载策略
<Link href="/dashboard" prefetch={true}>Dashboard</Link>
// prefetch={false} 关闭；prefetch={true} 预加载完整页面数据

// 强制静态化减少动态渲染
export const dynamic = 'force-static';

// RSC 优先 — 纯展示逻辑保留 Server Component（零 JS 交付）
// 仅交互/状态/浏览器 API 组件才 "use client"
```

---

## 关键 API（摘要）

- `<Script strategy>` (`next/script`) — 4 种策略控制脚本加载
- `dynamic()` (`next/dynamic`) — 动态导入组件，ssr/loading 选项
- `<Image priority>` / `<Link prefetch>` — LCP 优化 / 路由预加载
- `useReportWebVitals` (`next/web-vitals`) — Web Vitals 上报
- `GoogleAnalytics` / `GoogleTagManager` (`@next/third-parties/google`)
- `register()` / `onRequestError()` (`instrumentation.ts`) — 服务端初始化
- `optimizePackageImports` / `serverExternalPackages` (`next.config.ts`)

## 常见陷阱

- `<Script>` 的 `onLoad`/`onReady`/`onError` 仅在 Client Component 中生效
- 内联 `<Script>` 必须加 `id`，否则无法去重
- `dynamic()` 的 `ssr: false` 不能在 Server Component 中使用
- `instrumentation.ts` 要按 `NEXT_RUNTIME` 区分环境，避免导入不兼容模块
- `@next/bundle-analyzer` 仅 Webpack；Turbopack 用 `next experimental-analyze`
- `worker` strategy 实验性且不支持 App Router，生产慎用
- `useReportWebVitals` 必须在独立 Client Component 中，避免 layout 变 Client

## 组合提示

与 `nextjs-rendering`（段级 dynamic/revalidate 控制渲染模式）、`nextjs-styling-assets`（Image/Font 优化）联动。
