---
name: nextjs-rendering
description: "Next.js 15 渲染模式：SSG/SSR/ISR/PPR、段级 dynamic/revalidate/runtime 配置、generateStaticParams、generateMetadata。"
tech_stack: [nextjs]
language: [typescript]
---

# Next.js 渲染模式与段配置

> 来源：https://nextjs.org/docs/app/building-your-application/rendering
> https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config

## 用途

精细控制每条路由是静态预渲染、请求时渲染，还是介于中间的增量 / 部分预渲染。

## 何时使用

- 博客 / 文档要 SSG
- 依赖 cookie / 用户会话的页面要动态渲染
- 要按时间或事件增量更新页面（ISR）
- 想把页面拆成"静态外壳 + 动态洞"（PPR）

## 决定渲染模式的三类信号

Next 自动判断路由是静态还是动态，触发"动态"的信号：

- 使用了 `cookies()` / `headers()` / `draftMode()` / `connection()`
- `searchParams` 在 `page.tsx` 中被 await 读取
- `fetch()` 设了 `cache: 'no-store'` 或 `next: { revalidate: 0 }`
- 段级 `export const dynamic = 'force-dynamic'`

没有这些信号 → 默认**静态预渲染**。

## Route Segment Config（在 `layout.tsx` / `page.tsx` / `route.ts` 顶部导出）

```ts
// app/posts/page.tsx
export const dynamic = 'auto';        // 'auto' | 'force-dynamic' | 'error' | 'force-static'
export const revalidate = 3600;       // 秒；false = 永不失效；0 = 每次请求
export const fetchCache = 'auto';     // 'auto' | 'default-cache' | 'force-cache' | ...
export const runtime = 'nodejs';      // 'nodejs' | 'edge'
export const preferredRegion = 'auto';
export const dynamicParams = true;    // 未在 generateStaticParams 中的参数是否允许动态渲染
export const maxDuration = 30;        // 秒（Vercel / 支持平台）
```

常用组合：

```ts
// 强制 SSG（遇到动态信号就报错）
export const dynamic = 'error';

// 强制每次请求都跑（SSR）
export const dynamic = 'force-dynamic';

// ISR（5 分钟）
export const revalidate = 300;
```

## `generateStaticParams` — 预生成动态段

```tsx
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await db.post.findMany({ select: { slug: true } });
  return posts.map((p) => ({ slug: p.slug }));
}

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // ...
}
```

- 在 build 时运行，生成所有静态路径
- `dynamicParams = false` 表示未列出的 slug → 404
- 嵌套动态段时，返回数组的每一项包含所有段参数

## `generateMetadata` — 动态 `<head>`

```tsx
// app/blog/[slug]/page.tsx
import type { Metadata } from 'next';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: { images: [post.coverUrl] },
  };
}
```

静态元数据直接导出常量即可：

```ts
export const metadata: Metadata = { title: 'Home' };
```

## 部分预渲染 PPR（Partial Prerendering，实验性）

把页面渲染成"静态壳 + Suspense 洞"，壳在 build 时预渲染，洞在请求时流式填充。

```ts
// next.config.ts
const config = { experimental: { ppr: 'incremental' } };
```

```tsx
// app/product/[id]/page.tsx
export const experimental_ppr = true;

import { Suspense } from 'react';
export default function Page() {
  return (
    <>
      <StaticHeader />
      <Suspense fallback={<Skeleton />}>
        <DynamicPriceAndInventory />    {/* 使用 cookies/headers 或动态数据 */}
      </Suspense>
    </>
  );
}
```

PPR 仍在发展中，生产使用前确认目标 Next 版本的状态。

## Draft Mode（预览草稿）

```ts
// app/api/preview/route.ts
import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';

export async function GET() {
  (await draftMode()).enable();   // Next 15: draftMode() 返回 Promise
  redirect('/blog/preview-slug');
}
```

启用后相关页面在本次会话内绕过缓存。

## 关键 API（摘要）

- Segment exports：`dynamic`、`revalidate`、`runtime`、`fetchCache`、`preferredRegion`、`dynamicParams`、`maxDuration`、`experimental_ppr`
- `generateStaticParams()`、`generateMetadata()`
- `cookies()` / `headers()` / `draftMode()` / `connection()` from `'next/headers'`（Next 15 全部返回 Promise）

## 常见陷阱

- 把 `cookies()` 放进 RSC 却不想走动态 → 改用 middleware 读或把逻辑移到 route handler
- 设了 `revalidate = 0` 又设 `dynamic = 'force-static'` → 构建报错
- `generateStaticParams` 只对 build 时已知的路径有效；新内容需要 `revalidateTag`/`revalidatePath` 或 on-demand ISR
- Edge runtime 下不能用 Node-only 模块（`fs`、`child_process`），也不能用大部分 npm 原生依赖

## 组合提示

与 `nextjs-data-fetching`（fetch 选项与段级 revalidate 互补）、`nextjs-routing`（页面 props 结构）、`nextjs-metadata-seo`（generateMetadata 深入用法与 SEO 优化）联动。
