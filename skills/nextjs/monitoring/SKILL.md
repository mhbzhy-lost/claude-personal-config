---
name: nextjs-monitoring
description: Next.js 错误监控（Sentry）、Web Vitals 上报（useReportWebVitals）与 Vercel Web Analytics 集成
tech_stack: [nextjs]
language: [typescript]
capability: [observability]
version: "@sentry/nextjs 8.28.0+; nextjs 15+; @vercel/analytics unversioned"
collected_at: 2026-04-18
---

# Next.js 监控（Sentry / Web Vitals / Vercel Analytics）

> 来源：docs.sentry.io/platforms/javascript/guides/nextjs、nextjs.org/docs/app/guides/analytics、vercel.com/docs/analytics/quickstart

## 用途
给 Next.js 应用接入错误监控、分布式追踪、Session Replay、Web Vitals 上报与访客分析。

## 何时使用
- 生产应用需要服务端 + 客户端 + Edge 全链路错误监控 → Sentry
- 需要跟踪 Core Web Vitals（LCP/INP/CLS 等）送到任意后端 → `useReportWebVitals`
- 需要在应用挂载前初始化第三方 SDK → `instrumentation-client.ts`
- 部署在 Vercel 想要零配置访客/页面分析 → `@vercel/analytics`

## Sentry 集成

**向导式安装（推荐）**：`npx @sentry/wizard@latest -i nextjs`，自动生成所有配置文件。

**手动关键文件**（放项目根或 `src/`）：
- `instrumentation-client.ts` — 客户端 `Sentry.init`
- `sentry.server.config.ts` — Node runtime
- `sentry.edge.config.ts` — Edge runtime
- `instrumentation.ts` — 按 `NEXT_RUNTIME` 分发并导出 `onRequestError`
- `app/global-error.tsx` — App Router 全局错误边界，内部 `Sentry.captureException(error)`
- `next.config.ts` — 用 `withSentryConfig(nextConfig, { org, project, silent, authToken, widenClientFileUpload })` 包裹

**`instrumentation.ts` 模板**：

```ts
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config')
  if (process.env.NEXT_RUNTIME === 'edge')   await import('./sentry.edge.config')
}
export const onRequestError = Sentry.captureRequestError
```

**客户端初始化要点**：

```ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
  integrations: [Sentry.replayIntegration(), Sentry.feedbackIntegration({ colorScheme: 'system' })],
})
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart // 仪表路由跳转
```

**Server Action 追踪**：

```ts
'use server'
export async function submitForm(formData: FormData) {
  return Sentry.withServerActionInstrumentation(
    'submitForm',
    { headers: await headers(), formData, recordResponse: true },
    async () => { /* action body */ },
  )
}
```

**自定义 span / 日志**：

```ts
await Sentry.startSpan({ name: 'expensive-operation', op: 'function' }, async () => fetchData())
Sentry.logger.info('User action', { userId: '123' })
```

**Source Maps**：`authToken: process.env.SENTRY_AUTH_TOKEN` + `widenClientFileUpload: true`，CI 设 `SENTRY_AUTH_TOKEN`，**绝不入仓**。

**Tunneling 绕广告拦截**：`withSentryConfig(nextConfig, { tunnelRoute: '/sentry-tunnel' })`；若有中间件需在 matcher 放行（`proxy.ts` 于 Next.js 16+，`middleware.ts` 于 15）：

```ts
export const config = { matcher: ['/((?!sentry-tunnel|_next/static|_next/image|favicon.ico).*)'] }
```

**混合路由（App + Pages）**：App Router 按上文配置，Pages Router 额外加 `pages/_error.tsx`；SDK 自动识别路由类型。

## Web Vitals（Next.js 原生）

`useReportWebVitals` 必须 `'use client'`，为性能隔离在独立组件内：

```tsx
// app/_components/web-vitals.tsx
'use client'
import { useReportWebVitals } from 'next/web-vitals'

export function WebVitals() {
  useReportWebVitals((metric) => {
    // metric.name: TTFB | FCP | LCP | FID | CLS | INP
    const body = JSON.stringify(metric)
    if (navigator.sendBeacon) navigator.sendBeacon('/analytics', body)
    else fetch('/analytics', { body, method: 'POST', keepalive: true })
  })
  return null
}
```

`app/layout.tsx` 挂 `<WebVitals />` 即可。

**Google Analytics 对接**：CLS 需 `value * 1000` 转整数；用 `metric.id` 区分页面加载会话。

## `instrumentation-client.ts`
在前端代码之前执行，适合全局 analytics / 错误跟踪初始化：

```ts
// instrumentation-client.ts
window.addEventListener('error', (e) => reportError(e.error))
```

## Vercel Web Analytics

1. Vercel dashboard → Analytics → Enable（会加 `/_vercel/insights/*` 路由）
2. 安装 `@vercel/analytics`
3. App Router 在 `app/layout.tsx` 挂 `<Analytics />`（来自 `@vercel/analytics/next`）；Pages Router 在 `_app.tsx`
4. `vercel deploy`

Pro/Enterprise 可追加 custom events 跟踪按钮点击、表单提交等。

## 关键 API（摘要）
- `withSentryConfig(nextConfig, options)` — 包裹 `next.config.ts`
- `Sentry.captureRequestError` — 从 `instrumentation.ts` 导出为 `onRequestError`
- `Sentry.captureRouterTransitionStart` — 客户端导出为 `onRouterTransitionStart`
- `Sentry.withServerActionInstrumentation(name, opts, fn)` — 包 Server Action
- `Sentry.startSpan({ name, op }, fn)` — 自定义 span
- `Sentry.logger.info/warn/error(msg, ctx)` — 结构化日志（需 `enableLogs: true`）
- `Sentry.replayIntegration({ maskAllText, maskAllInputs, blockAllMedia })` — Session Replay
- `useReportWebVitals(cb)` — `next/web-vitals`
- `<Analytics />` — `@vercel/analytics/next`

## 注意事项
- `onRequestError` 要求 `@sentry/nextjs >= 8.28.0` 与 Next.js 15
- Tunneling 会增加服务器负载，量大时慎用
- **`SENTRY_AUTH_TOKEN` 切勿入仓**，只在 CI/CD 注入
- Session Replay 默认 mask 全部文本/输入/媒体；按需在 Privacy Configuration 调整
- DSN 放 `NEXT_PUBLIC_SENTRY_DSN`（public 变量才能进客户端 bundle）
- `useReportWebVitals` 回调里用 `navigator.sendBeacon` 优先，卸载时才不丢样本
- Vercel Analytics 必须部署到 Vercel 后才开始采集；Network 里能看到 `/_vercel/insights/view` 请求代表工作正常

## 组合提示
- Server Action 错误追踪与 `nextjs-http-client` 里的 mutation 流程天然配合
- Web Vitals 可推送到任何后端（自建、GA、Datadog），不必绑定 Vercel Analytics
