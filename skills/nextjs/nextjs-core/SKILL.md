---
name: nextjs-core
description: "Next.js 15 项目结构、文件系统约定、App Router vs Pages Router、next.config、TypeScript、运行时模型总览。"
tech_stack: [nextjs]
---

# Next.js 15 Core（项目骨架与约定）

> 来源：https://nextjs.org/docs/app/getting-started
> 版本基准：Next.js 15（React 19），App Router 为首选。

## 用途

建立正确的项目骨架与心智模型，避免把 Pages Router 的经验直接套用到 App Router。

## 何时使用

- 新建 Next.js 项目或接手一个已有项目需要快速搞懂目录约定
- 需要决定一个特性放在 `app/` 还是 `pages/`
- 配置 `next.config.ts` / TypeScript / 别名路径

## 创建项目

```bash
npx create-next-app@latest my-app --typescript --app --tailwind --eslint
cd my-app
npm run dev   # http://localhost:3000
```

## 目录约定（App Router）

```
my-app/
├── app/                      # App Router 根（RSC 默认）
│   ├── layout.tsx            # 根 layout（必须，含 <html>/<body>）
│   ├── page.tsx              # 路由 /
│   ├── loading.tsx           # 路由级 Suspense fallback
│   ├── error.tsx             # 错误边界（必须是 "use client"）
│   ├── not-found.tsx         # 404
│   ├── global-error.tsx      # 根层错误（含 <html>/<body>）
│   ├── template.tsx          # 每次导航重建的 layout
│   ├── (group)/              # 路由组，不影响 URL
│   ├── @slot/                # 并行路由插槽
│   ├── [id]/                 # 动态段
│   ├── [...slug]/            # catch-all
│   └── [[...slug]]/          # 可选 catch-all
├── public/                   # 静态资源，URL /foo.png
├── next.config.ts
├── tsconfig.json
└── middleware.ts             # 根目录或 src/ 下
```

可选 `src/` 目录：若采用，则 `src/app/` 生效，`public/`、`next.config.ts`、`middleware.ts` 仍留在根。

## next.config.ts（Next 15 支持 TS 配置）

```ts
// next.config.ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.example.com' }],
  },
  experimental: {
    // ppr: 'incremental',   // 部分预渲染（实验性）
    // reactCompiler: true,
  },
};

export default config;
```

## TypeScript / 路径别名

```json
// tsconfig.json（create-next-app 默认生成）
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  }
}
```

## 运行时模型（重要心智）

- App Router 下，所有组件**默认是 Server Component（RSC）**，在服务端渲染，不打进客户端 bundle
- 在文件顶部加 `"use client"` 才变成 Client Component（可用 `useState` / `useEffect` / 浏览器 API）
- 每个路由段都可以有自己的 `layout.tsx` / `loading.tsx` / `error.tsx`，嵌套生效
- 路由段可声明 `export const dynamic`、`revalidate`、`runtime`、`fetchCache` 等 segment config 控制渲染行为

## App Router vs Pages Router

| 维度 | App Router (`app/`) | Pages Router (`pages/`) |
|---|---|---|
| 组件模型 | RSC + Client Components | 全部 Client |
| 数据获取 | 组件内 `await fetch()` / Server Actions | `getServerSideProps` / `getStaticProps` |
| Layout | 嵌套 `layout.tsx` | `_app.tsx` + 自定义 layout 模式 |
| 流式渲染 | 原生 `Suspense` / `loading.tsx` | 有限 |
| API | `app/api/*/route.ts` | `pages/api/*.ts` |

两者可共存，但**新代码一律优先 App Router**。

## 关键文件作用（速查）

- `layout.tsx` — 共享 UI，导航不卸载（props: `children`，动态段的 `params`）
- `page.tsx` — 路由可访问的 UI（props: `params`、`searchParams`，**在 Next 15 中二者为 Promise**）
- `loading.tsx` — 自动包裹 `<Suspense>` 的 fallback
- `error.tsx` — 自动包裹 Error Boundary（必须 client component，props: `error`, `reset`）
- `not-found.tsx` — 由 `notFound()` 或未匹配时触发
- `route.ts` — Route Handler，HTTP 方法导出函数
- `default.tsx` — 并行路由未命中时兜底

## 常见陷阱

- **Next 15 破坏性变更**：`params` / `searchParams` / `cookies()` / `headers()` / `draftMode()` 返回 Promise，必须 `await`
- **默认 fetch 不再缓存**：Next 15 起 `fetch()` 默认 `cache: 'no-store'`，需要缓存要显式 `cache: 'force-cache'` 或设 `revalidate`
- **`"use client"` 的感染性**：client component 导入的其他组件仍可以是 server component，但只能通过 `children` prop 传递，不能直接在 client 文件里 `import` 再渲染一个 server component
- 不要在 RSC 里用浏览器专属 API（`window`、`localStorage`、`useState` 等）

## 组合提示

配合 `nextjs-routing`、`nextjs-server-components`、`nextjs-data-fetching` 形成最小可用知识闭环。进阶主题：`nextjs-caching`（缓存架构）、`nextjs-metadata-seo`（SEO）、`nextjs-optimization`（性能优化）。
