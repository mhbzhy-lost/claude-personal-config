---
name: nextjs-routing
description: "Next.js 15 App Router 路由体系：layouts、pages、路由组、动态段、并行/拦截路由、loading/error/not-found/template 特殊文件。"
tech_stack: [nextjs, react, frontend]
language: [typescript]
---

# Next.js App Router 路由

> 来源：https://nextjs.org/docs/app/building-your-application/routing

## 用途

按文件系统组织路由与嵌套 UI，同时利用 App Router 的高级能力（并行插槽、拦截、流式 fallback）。

## 何时使用

- 设计多层嵌套 UI（后台控制台、dashboard）
- 需要路由级的 loading / error 隔离
- 需要同一页面并行多个视图（通知抽屉、模态覆盖原页）

## 基础页面与 Layout

```tsx
// app/layout.tsx — 根 layout（必填）
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// app/page.tsx — 路由 /
export default function HomePage() {
  return <h1>Home</h1>;
}
```

```tsx
// app/dashboard/layout.tsx — 嵌套 layout
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <nav>Dashboard 侧栏</nav>
      <main>{children}</main>
    </section>
  );
}
```

## 动态路由段

```tsx
// app/users/[id]/page.tsx
type Props = { params: Promise<{ id: string }> };

export default async function UserPage({ params }: Props) {
  const { id } = await params;         // Next 15: params 是 Promise
  return <div>User {id}</div>;
}
```

- `[id]` — 单段动态参数
- `[...slug]` — catch-all，`slug: string[]`
- `[[...slug]]` — 可选 catch-all，路径 `/` 也匹配

## 路由组（不影响 URL）

```
app/
├── (marketing)/
│   ├── layout.tsx        # 仅 marketing 页共享
│   ├── about/page.tsx    # URL: /about
│   └── pricing/page.tsx  # URL: /pricing
└── (app)/
    ├── layout.tsx
    └── dashboard/page.tsx  # URL: /dashboard
```

`(name)` 包裹的目录只是组织手段，URL 中看不到。

## 特殊文件

```tsx
// app/dashboard/loading.tsx — 段内 Suspense fallback
export default function Loading() {
  return <div>加载中...</div>;
}
```

```tsx
// app/dashboard/error.tsx — 错误边界，必须 client
'use client';
export default function Error({
  error,
  reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div>
      <p>出错了：{error.message}</p>
      <button onClick={reset}>重试</button>
    </div>
  );
}
```

```tsx
// app/not-found.tsx — 由 notFound() 触发，或未匹配路由时
export default function NotFound() {
  return <h2>页面不存在</h2>;
}
```

```tsx
// app/template.tsx — 与 layout 类似，但每次导航重建（state/effect 会重置）
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="fade-in">{children}</div>;
}
```

`global-error.tsx` 仅在根 layout 本身崩溃时触发，必须包含自己的 `<html>` 和 `<body>`。

## 并行路由（Parallel Routes）

用于在同一 layout 中并行渲染多个独立的路由子树（插槽）。

```
app/
├── layout.tsx      # 接收 children + analytics + team
├── page.tsx
├── @analytics/
│   ├── default.tsx # 插槽未命中时的兜底（必须！）
│   └── page.tsx
└── @team/
    ├── default.tsx
    └── page.tsx
```

```tsx
// app/layout.tsx
export default function Layout({
  children,
  analytics,
  team,
}: {
  children: React.ReactNode;
  analytics: React.ReactNode;
  team: React.ReactNode;
}) {
  return (
    <>
      {children}
      <aside>{analytics}</aside>
      <aside>{team}</aside>
    </>
  );
}
```

## 拦截路由（Intercepting Routes）

在当前 layout 内"截获"另一路由以实现模态等覆盖效果。

- `(.)foo` 同级拦截
- `(..)foo` 上一级
- `(..)(..)foo` 两级
- `(...)foo` 从根

典型组合：照片详情页 `/photos/[id]`，在列表页打开时用 modal 覆盖。

```
app/
├── @modal/
│   ├── default.tsx
│   └── (.)photos/[id]/page.tsx   # 在列表路由下拦截，渲染为 Modal
├── photos/
│   └── [id]/page.tsx             # 直接访问 URL 时的完整页
└── layout.tsx                    # 同时渲染 children 与 @modal
```

## 页面参数类型（Next 15）

```tsx
// app/blog/[slug]/page.tsx
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
  return <article>{slug} / {q}</article>;
}
```

## 关键 API（摘要）

- `layout.tsx` / `page.tsx` / `loading.tsx` / `error.tsx` / `not-found.tsx` / `template.tsx` / `default.tsx` / `route.ts`
- `generateStaticParams()` — 在动态路由上预生成参数列表（详见 `nextjs-rendering`）
- `generateMetadata()` — 动态生成 `<head>`（详见 `nextjs-rendering`）

## 常见陷阱

- 每个并行路由插槽目录**必须提供 `default.tsx`**，否则导航到未命中的组合时会 404
- `error.tsx` 必须 `"use client"`，且**捕获不到同级 layout 的错误**（被上级或 `global-error.tsx` 捕获）
- `template.tsx` 每次导航重建，滥用会损失状态保持的好处
- 动态段命名不能与同级静态段冲突（`app/blog/new/page.tsx` 与 `app/blog/[slug]/page.tsx` 共存时，`new` 优先静态）

## 组合提示

与 `nextjs-navigation`（Link / useRouter）和 `nextjs-rendering`（generateMetadata / generateStaticParams）组合使用。
