---
name: nextjs-data-fetching
description: "Next.js 15 数据获取：fetch 缓存语义、revalidate、tags、unstable_cache、Suspense 流式、revalidatePath/revalidateTag。"
tech_stack: [nextjs]
---

# Next.js 15 数据获取与缓存

> 来源：https://nextjs.org/docs/app/building-your-application/data-fetching
> https://nextjs.org/docs/app/building-your-application/caching

## 用途

在 RSC 中以最直接的方式拉数据，并精细控制何时走缓存、何时重新生成。

## 何时使用

- 页面 / layout 需要拉取后端数据
- 需要按时间或按事件失效缓存
- 需要流式渐进渲染多个异步块

## 在 RSC 里直接 `await fetch`

```tsx
// app/posts/page.tsx
export default async function Posts() {
  const res = await fetch('https://api.example.com/posts', {
    // Next 15 默认 no-store：每次请求都重新拉
    // 想缓存要显式写：
    cache: 'force-cache',
    next: { revalidate: 60, tags: ['posts'] },
  });
  const posts: Post[] = await res.json();
  return <ul>{posts.map((p) => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

**关键：Next 15 默认 `fetch` 不缓存**（行为从 Next 14 变更）。要缓存必须显式声明。

## fetch 选项速查

```ts
// 强缓存（build 时或第一次请求后）
fetch(url, { cache: 'force-cache' });

// 不缓存（默认）
fetch(url, { cache: 'no-store' });

// 基于时间重新验证（单位秒）
fetch(url, { next: { revalidate: 3600 } });

// 按 tag 失效
fetch(url, { next: { tags: ['posts', `post-${id}`] } });
```

## 非 fetch 数据源：`unstable_cache`

数据库、ORM、SDK 不走 `fetch`，用 `unstable_cache` 包装：

```ts
// lib/data.ts
import { unstable_cache } from 'next/cache';
import { db } from './db';

export const getUser = unstable_cache(
  async (id: string) => db.user.findUnique({ where: { id } }),
  ['user-by-id'],                 // key parts（与参数合并）
  { revalidate: 60, tags: ['user'] }
);
```

## 主动失效

```ts
// app/actions.ts
'use server';
import { revalidatePath, revalidateTag } from 'next/cache';

export async function updatePost(id: string, data: unknown) {
  await db.post.update({ where: { id }, data });
  revalidateTag(`post-${id}`);  // 失效所有 tag 为 post-<id> 的 fetch/unstable_cache
  revalidatePath('/posts');     // 重新生成该路径
}
```

## 流式 + Suspense

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';

async function Slow() {
  const data = await fetch('https://slow.example.com', { cache: 'no-store' }).then((r) => r.json());
  return <div>{data.value}</div>;
}

export default function Page() {
  return (
    <main>
      <h1>Dashboard</h1>
      <Suspense fallback={<p>加载慢数据中...</p>}>
        <Slow />
      </Suspense>
    </main>
  );
}
```

路由级 fallback 用 `app/.../loading.tsx`（见 `nextjs-routing`）。

## 请求记忆化（同一渲染周期）

同一次渲染中，相同 URL + 选项的 `fetch()` 会自动 memoize，不会真的发两次请求。自定义非 fetch 函数想要同请求内去重用 `react` 的 `cache`：

```ts
import { cache } from 'react';
export const getItem = cache(async (id: string) => db.item.find(id));
```

## 客户端数据获取

需要在用户交互后拉数据（搜索框、无限滚动）：
- 用 `fetch` / SWR / TanStack Query 走 Route Handler（`app/api/.../route.ts`）
- 或调 Server Action 把逻辑留在服务端

## 并发与顺序

```tsx
// 并发（推荐）
const [user, posts] = await Promise.all([getUser(id), getPosts(id)]);

// 顺序（有依赖时）
const user = await getUser(id);
const posts = await getPosts(user.teamId);
```

## 关键 API（摘要）

- `fetch(url, { cache, next: { revalidate, tags } })`
- `unstable_cache(fn, keyParts?, { revalidate, tags })`
- `revalidatePath(path, type?)` — `type` 可选 `'page'` / `'layout'`
- `revalidateTag(tag)`
- `cache(fn)` from `'react'` — 同请求内记忆化

## 常见陷阱

- **默认不缓存**：升级到 Next 15 时大量 `fetch` 变慢，必须显式加 `cache: 'force-cache'` 或 `next.revalidate`
- `cache` 与 `next.revalidate` 冲突：设了 `revalidate` 就不要再设 `cache: 'no-store'`
- `revalidatePath` 只失效缓存，不会立刻重渲染已打开的页面——依赖下次请求
- `cookies()` / `headers()` 在 RSC 中会让本次渲染动态化（不可 SSG），影响缓存选择
- `unstable_cache` 的 key 必须稳定；闭包里不相关的变量变化不会反映到 key

## 组合提示

与 `nextjs-server-actions`（突变后调 revalidate）、`nextjs-rendering`（段级 revalidate）、`nextjs-caching`（四层缓存架构详解与调试）搭配。
