---
name: nextjs-navigation
description: "Next.js 15 导航 API：<Link>、useRouter、usePathname、useSearchParams、redirect/permanentRedirect、notFound。Use when implementing client navigation, programmatic redirects or reading the current URL."
tech_stack: [nextjs]
---

# 导航与 URL（Next.js 15）

> 来源：https://nextjs.org/docs/app/api-reference/functions
> https://nextjs.org/docs/app/api-reference/components/link

## 用途

在 App Router 下做前端导航、读取当前 URL、在服务端触发重定向 / 404。

## 何时使用

- 菜单 / 面包屑 / 列表跳转
- 登录后跳首页、异常时 404
- 读取 URL 参数驱动 UI（过滤、分页）

## `<Link>`

```tsx
import Link from 'next/link';

export function Nav() {
  return (
    <nav>
      <Link href="/">首页</Link>
      <Link href="/posts/hello">文章</Link>
      <Link href={{ pathname: '/search', query: { q: 'next' } }}>搜索</Link>
      <Link href="/dashboard" prefetch={false}>不预取</Link>
      <Link href="/" replace>替换历史</Link>
      <Link href="/about" scroll={false}>不滚动到顶部</Link>
    </nav>
  );
}
```

- `href` 支持 string 或 `UrlObject`
- 默认会 hover/进入视口时预取（仅生产构建）；`prefetch={false}` 关闭
- `replace`：用 `replaceState` 代替 `pushState`
- 指向外站用普通 `<a>` 即可

## `useRouter` — 编程式导航（client）

```tsx
'use client';
import { useRouter } from 'next/navigation';     // 注意：不是 'next/router'

export function LoginButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await signIn();
        router.push('/dashboard');
        // router.replace('/dashboard');
        // router.back(); router.forward();
        // router.refresh();   // 重新请求当前路由的 RSC 数据
        // router.prefetch('/settings');
      }}
    >
      登录
    </button>
  );
}
```

**关键**：App Router 用 `'next/navigation'`；Pages Router 才是 `'next/router'`，不要混。

## `usePathname` / `useSearchParams` / `useParams`

```tsx
'use client';
import { usePathname, useSearchParams, useParams } from 'next/navigation';

export function DebugBar() {
  const pathname = usePathname();           // "/posts/hello"
  const search = useSearchParams();         // URLSearchParams（只读）
  const params = useParams<{ slug: string }>();  // { slug: 'hello' }
  const q = search.get('q');
  return <div>{pathname} ? q={q}</div>;
}
```

`useSearchParams()` 在 client component 中会让它成为"动态边界"，建议用 `<Suspense>` 包裹以获得更好的流式行为。

## 服务端重定向与 404

```ts
import { redirect, permanentRedirect, notFound } from 'next/navigation';

// RSC 或 Server Action 里
if (!user) redirect('/login');
if (slugRenamed) permanentRedirect('/new-slug');   // 308
if (!post) notFound();                              // 渲染最近的 not-found.tsx
```

这三个函数内部通过 throw 实现，**不要 try/catch**。

## 修改 searchParams 的常用模式

```tsx
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export function Filter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setStatus = (status: string) => {
    const next = new URLSearchParams(params);
    if (status) next.set('status', status); else next.delete('status');
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <select value={params.get('status') ?? ''} onChange={(e) => setStatus(e.target.value)}>
      <option value="">全部</option>
      <option value="open">Open</option>
      <option value="done">Done</option>
    </select>
  );
}
```

## 在 Server Component 中读 URL

Server Component 不能用 `usePathname` / `useSearchParams` 等 hook。读 URL 用 page props：

```tsx
// app/search/page.tsx
export default async function Search({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <div>搜索词：{q ?? '无'}</div>;
}
```

## 关键 API（摘要）

- `<Link href prefetch replace scroll>` from `'next/link'`
- from `'next/navigation'`:
  - `useRouter()` → `push` / `replace` / `back` / `forward` / `refresh` / `prefetch`
  - `usePathname()` / `useSearchParams()` / `useParams()`
  - `redirect(path)` / `permanentRedirect(path)` / `notFound()`

## 常见陷阱

- 从 `'next/router'` 导入 `useRouter` 并在 App Router 里用 → 运行时报错；换成 `'next/navigation'`
- `router.push('/foo')` 后立即读新路径的数据 → 数据获取是异步的，要么用 `router.refresh()` 配合，要么 `revalidateTag`
- `useSearchParams()` 没包在 `<Suspense>` 中会让整个页面退化为 CSR 数据获取路径
- `redirect()` 在 `try/catch` 里被吞 → 放到外部，或重新抛出
- `prefetch` 只在生产构建里真跑，开发模式下 `<Link>` 不会实际预取

## 组合提示

与 `nextjs-server-actions`（action 末尾 `redirect`）、`nextjs-routing`（`not-found.tsx` / `error.tsx`）联动。
