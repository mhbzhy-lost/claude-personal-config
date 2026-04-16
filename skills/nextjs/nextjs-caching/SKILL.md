---
name: nextjs-caching
description: "Next.js 15 缓存架构：四层缓存机制（请求记忆化/数据缓存/全路由缓存/路由器缓存）、缓存配置与失效策略、use cache 指令、调试与关闭方法。"
tech_stack: [nextjs]
language: [typescript]
---

# Next.js 缓存架构

> 来源：https://nextjs.org/docs/app/building-your-application/caching
> https://nextjs.org/docs/app/getting-started/caching

## 用途

理解和控制 Next.js 多层缓存机制，精确配置缓存策略、失效方式，解决缓存相关的性能和数据一致性问题。

## 何时使用

- 需要理解页面为何返回旧数据（缓存排查）
- 配置路由级别的缓存 / 重验证策略
- 在数据变更后主动失效缓存
- 从 Next 14 升级到 15，fetch 行为发生变更
- 使用 `use cache` 指令进行组件/函数级缓存

## 四层缓存架构概览

| 层级 | 位置 | 作用 | 持续时间 |
|------|------|------|----------|
| Request Memoization | 服务端（单次渲染） | 同一渲染周期内去重相同请求 | 请求结束即销毁 |
| Data Cache | 服务端（跨请求持久化） | 缓存 fetch 结果和 `unstable_cache` 结果 | 手动失效或 revalidate |
| Full Route Cache | 服务端（build 或首次请求） | 缓存整个路由的 HTML + RSC Payload | 手动失效或 revalidate |
| Router Cache | 客户端（浏览器内存） | 缓存已访问路由的 RSC Payload | 会话或 staleTimes 配置 |

### 1. Request Memoization

同一渲染周期内，相同 URL + 选项的 `fetch()` 自动去重。非 fetch 函数用 React `cache` 实现：

```ts
import { cache } from 'react';
import { db } from '@/lib/db';

// 同一次渲染中多次调用只会执行一次查询
export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});
```

### 2. Data Cache

服务端持久化存储 fetch 结果。**Next 15 起 fetch 默认 `no-store`（不缓存）**。

```ts
// 不缓存（Next 15 默认）
await fetch('https://api.example.com/data');

// 强制缓存
await fetch('https://api.example.com/data', { cache: 'force-cache' });

// 基于时间重验证（单位秒）
await fetch('https://api.example.com/data', { next: { revalidate: 3600 } });

// 带 tag 以支持按需失效
await fetch('https://api.example.com/data', {
  next: { tags: ['posts'], revalidate: 3600 },
});
```

### 3. Full Route Cache

Build 时（SSG）或首次请求后（ISR）缓存整个路由的 HTML 和 RSC Payload。通过段配置控制：

```ts
// app/page.tsx — 段级配置
export const dynamic = 'force-static';  // 强制静态
export const revalidate = 3600;          // ISR：每小时重验证
```

`dynamic` 选项值：`'auto'`（默认）| `'force-dynamic'` | `'force-static'` | `'error'`

### 4. Router Cache（客户端）

浏览器内存中缓存已访问路由的 RSC Payload，用于前进/后退导航。

**Next 15 变更**：`dynamic` 路由的 staleTimes 默认从 30s 改为 **0s**（不缓存）。

```js
// next.config.js — 自定义客户端缓存时间（实验性）
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,   // 动态页默认 0s，可改回 30s
      static: 180,   // 静态页默认 5 分钟
    },
  },
};
module.exports = nextConfig;
```

## 缓存失效方式

### revalidatePath — 按路径失效

```ts
import { revalidatePath } from 'next/cache';

// 失效具体路径
revalidatePath('/blog/post-1');

// 失效动态路由的所有 page（需传 type）
revalidatePath('/blog/[slug]', 'page');

// 失效 layout 及其下所有子页面
revalidatePath('/blog/[slug]', 'layout');

// 失效全站缓存
revalidatePath('/', 'layout');
```

签名：`revalidatePath(path: string, type?: 'page' | 'layout'): void`

注意：`path` 是路由文件结构路径，不是浏览器 URL。使用 rewrites 时需传 **destination** 路径。

### revalidateTag — 按标签失效

```ts
import { revalidateTag } from 'next/cache';

// 在 Server Action 中失效
export async function updatePost() {
  'use server';
  await db.post.update(/* ... */);
  revalidateTag('posts');
}
```

签名：`revalidateTag(tag: string): void`

标签通过 `fetch` 的 `next.tags` 或 `unstable_cache` 的 `tags` 选项绑定。

### Time-based Revalidation

```ts
// fetch 级别
await fetch(url, { next: { revalidate: 3600 } });

// 路由段级别（对整个路由生效）
export const revalidate = 3600; // seconds
```

规则：同一路由中，最短的 `revalidate` 值决定整条路由的重验证频率。

## `unstable_cache`（Next 15，已在 Next 16 中被 `use cache` 替代）

用于缓存非 fetch 数据源（数据库、ORM 等）的结果：

```ts
import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';

export const getCachedUser = unstable_cache(
  async (id: string) => {
    return db.user.findUnique({ where: { id } });
  },
  ['user-by-id'],  // keyParts：与函数参数合并生成缓存 key
  {
    tags: ['user'],       // 支持 revalidateTag 失效
    revalidate: 3600,     // 秒
  }
);

// 使用
const user = await getCachedUser('user-123');
```

与 fetch 缓存的区别：
- `unstable_cache` 包装任意异步函数，fetch 缓存只针对 HTTP 请求
- key 由 `keyParts` + 序列化后的函数参数组成
- 不能在缓存函数内访问 `cookies()` / `headers()`

## `use cache` 指令（Next 16+ / Next 15 实验性）

`use cache` 是 `unstable_cache` 的继任者，支持数据级和 UI 级缓存：

```ts
// next.config.ts — 启用 Cache Components
import type { NextConfig } from 'next';
const nextConfig: NextConfig = { cacheComponents: true };
export default nextConfig;
```

### 数据级缓存

```ts
import { cacheLife, cacheTag } from 'next/cache';

export async function getProducts() {
  'use cache';
  cacheLife('hours');         // 内置 profile：控制缓存时长
  cacheTag('products');       // 标签：支持按需失效
  return db.query('SELECT * FROM products');
}
```

### UI 级缓存（缓存整个组件/页面）

```tsx
export default async function BlogPage() {
  'use cache';
  cacheLife('hours');
  cacheTag('blog');
  const data = await fetch('https://api.example.com/posts').then((r) => r.json());
  return <ul>{data.map((p: { id: string; title: string }) => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

### Cache Key 规则

`use cache` 的 key 由以下自动生成：Build ID + 函数 ID + 序列化参数（含闭包捕获的变量）。

### `cacheLife` 内置 profiles

- `'default'`：stale 5 分钟 / revalidate 15 分钟
- `'hours'`、`'days'`、`'weeks'`、`'max'` 等预设
- 可在 `next.config.ts` 中自定义 profile

### 失效方式

```ts
'use server';
import { updateTag, revalidateTag } from 'next/cache';

export async function updateProduct() {
  await db.products.update(/* ... */);
  updateTag('products');      // 立即过期
  // 或
  revalidateTag('products');  // 标记为 stale（下次访问时重验证）
}
```

## 调试缓存

### 判断路由类型（`next build` 输出）

```
Route (app)                  Size    First Load JS
┌ ○ /                        5.2 kB    89.5 kB
├ ○ /about                   1.5 kB    85.8 kB
├ λ /api/data                0 B       0 B
├ ● /blog/[slug]             2.1 kB    86.4 kB
└ λ /dashboard               3.8 kB    88.1 kB

○  (Static)    — build 时完全预渲染
●  (SSG/ISR)   — build 时预渲染，带周期性重验证
λ  (Dynamic)   — 每次请求时服务端渲染
```

### 开发环境 vs 生产环境

- **开发环境**：页面始终动态渲染，不走缓存（方便调试）
- **生产环境**：按配置走缓存，`next build` 后才能看到真实缓存行为
- 使用 `NEXT_PRIVATE_DEBUG_CACHE=1` 环境变量开启详细缓存日志

### `force-dynamic` 强制动态

```ts
// 整个路由强制动态渲染（跳过所有缓存）
export const dynamic = 'force-dynamic';
```

## 关键 API（摘要）

- `fetch(url, { cache, next: { revalidate, tags } })` — HTTP 请求缓存
- `unstable_cache(fn, keyParts?, { revalidate, tags })` — 非 fetch 缓存（Next 15）
- `'use cache'` + `cacheLife(profile)` + `cacheTag(tag)` — 声明式缓存（Next 16+）
- `revalidatePath(path, type?)` — 按路径失效
- `revalidateTag(tag)` — 按标签失效（stale-while-revalidate）
- `updateTag(tag)` — 按标签立即过期（Next 16+）
- `cache(fn)` from `'react'` — 单次渲染内请求去重
- `export const dynamic / revalidate / fetchCache` — 路由段配置

## 常见陷阱

- **Next 14 -> 15 默认行为变更**：fetch 从默认缓存变为默认 `no-store`，升级后可能出现大量请求变慢
- **Router Cache 默认行为变更**：Next 15 起动态路由的客户端缓存时间默认为 0s
- **开发环境无缓存**：开发时页面总是动态渲染，缓存问题只在 `next build && next start` 后可复现
- **`cookies()` / `headers()` 导致动态化**：在 RSC 中调用会使整个路由变为动态渲染
- **`unstable_cache` 的 key 陷阱**：闭包中引用的变量变化不会反映到 cache key，需通过参数传入
- **`use cache` 内不能直接访问 `cookies()` / `headers()`**：需在缓存边界外读取，作为参数传入
- **`revalidatePath` 用的是路由文件路径**：使用 rewrites 时需传 destination 路径而非 source 路径
- **`revalidate` 最短值生效**：嵌套 layout/page 中最短的 revalidate 值决定整条路由的重验证频率

## 组合提示

与 `nextjs-server-actions`（变更后触发 revalidate）、`nextjs-rendering`（理解段级渲染策略）、`nextjs-data-fetching`（fetch 模式与流式渲染）搭配使用。
