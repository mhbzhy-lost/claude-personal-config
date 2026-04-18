---
name: nextjs-http-client
description: Next.js App Router / Pages Router 下的数据获取方案（原生 fetch、TanStack Query、SWR）与 SSR 水合、流式渲染最佳实践
tech_stack: [nextjs]
language: [typescript]
capability: [http-client, data-fetching]
version: "nextjs unversioned; @tanstack/react-query 5.40.0+; swr unversioned"
collected_at: 2026-04-18
---

# Next.js 数据获取与 HTTP 客户端

> 来源：nextjs.org/docs/app/getting-started/fetching-data、tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr、swr.vercel.app/docs/with-nextjs

## 用途
在 Next.js 中选择并正确配置数据获取方案：Server Component 原生 `fetch`、TanStack Query 的 prefetch/dehydrate/stream、SWR 的 `SWRConfig.fallback`。

## 何时使用
- Server Component 拉数据 → 原生 `fetch` + `<Suspense>` / `loading.js`
- 客户端高频更新、需缓存与重试 → TanStack Query 或 SWR
- 需服务端预取再无缝接管到客户端 → TanStack `HydrationBoundary` + `dehydrate`，或 SWR `fallback`
- 只想避免 3 次往返、简单场景 → React `use()` API + 服务端传 promise

## Next.js 原生 fetch（Server Component）

```tsx
// app/blog/page.tsx
export default async function Page() {
  const posts = await fetch('https://api.vercel.app/blog').then(r => r.json())
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}
```

- 同一请求树中**相同 fetch 被自动 memoize**
- **默认不缓存**，阻塞页面渲染；要缓存用 `use cache` 指令，要不阻塞用 `<Suspense>`
- 服务端可直接用 ORM / DB client，凭证不进客户端 bundle
- **并行**：不 await 直接发起多个 `fetch`，最后 `Promise.all`；一个失败则全挂，需要容错用 `Promise.allSettled`
- **流式**：`loading.js` 整页流式、`<Suspense>` 细粒度流式
- **跨 Server/Client 共享**：`React.cache(fn)` 包裹 + Context 传 promise + Client 用 `use()` 读（`React.cache` 仅作用于当前请求）

## TanStack Query — App Router 标准模式

`app/get-query-client.ts`：**每次 server 渲染新建，浏览器单例**：

```ts
import { isServer, QueryClient } from '@tanstack/react-query'

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } })
}
let browserClient: QueryClient | undefined
export function getQueryClient() {
  if (isServer) return makeQueryClient()
  return (browserClient ??= makeQueryClient())
}
```

`app/providers.tsx`（`'use client'`）包一层 `QueryClientProvider`，挂到 root layout。

**预取 + 水合**：

```tsx
// app/posts/page.tsx (Server Component)
export default async function PostsPage() {
  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({ queryKey: ['posts'], queryFn: getPosts })
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Posts />
    </HydrationBoundary>
  )
}
```

Client 侧 `useQuery({ queryKey: ['posts'], queryFn: getPosts })` 直接命中缓存。

**流式（v5.40.0+）**：可以 dehydrate pending queries 而不 await：

```ts
new QueryClient({
  defaultOptions: {
    dehydrate: {
      shouldDehydrateQuery: (q) =>
        defaultShouldDehydrateQuery(q) || q.state.status === 'pending',
    },
  },
})
```

```tsx
queryClient.prefetchQuery({ queryKey: ['posts'], queryFn: getPosts }) // 不 await
return <HydrationBoundary state={dehydrate(queryClient)}><Posts /></HydrationBoundary>
```

Client 端用 `useSuspenseQuery` 消费 promise。

**Pages Router**：`queryClient` 放入 React state（`useState(() => new QueryClient())`）保证请求隔离；`getServerSideProps/getStaticProps` 内 `prefetchQuery` → 返回 `dehydrate(queryClient)` → `_app` 里挂 `<HydrationBoundary state={pageProps.dehydratedState}>`。

**实验式零 prefetch**：`@tanstack/react-query-next-experimental` 的 `<ReactQueryStreamedHydration>`，客户端直接 `useSuspenseQuery`，服务端自动 stream。DX 最好但页面导航性能次于手动 prefetch。

## SWR — App Router

Server Component 启动 promise 并通过 `SWRConfig.fallback` 传给 Client：

```tsx
// app/layout.tsx
export default async function Layout({ children }) {
  const userPromise = fetchUserFromAPI()   // 不 await，并行执行
  const postsPromise = fetchPostsFromAPI()
  return (
    <SWRConfig value={{ fallback: { '/api/user': userPromise, '/api/posts': postsPromise } }}>
      {children}
    </SWRConfig>
  )
}
```

Client 组件 `useSWR('/api/user', fetcher)` 自动解析 promise。

**Pages Router** 用 `getStaticProps` 返 `fallback`，`_app` 包 `<SWRConfig value={{ fallback }}>`。数组/函数 key 需 `unstable_serialize(['api','article',1])` 序列化。

**限制**：RSC 里只能 import `SWRConfig` 与 `unstable_serialize`，`useSWR` / `useSWRInfinite` / `useSWRMutation` 是客户端 hooks，RSC 不可用。

## 关键 API（摘要）
- `QueryClient` / `QueryClientProvider` / `HydrationBoundary` / `dehydrate` — TanStack 水合四件套
- `queryClient.prefetchQuery(...)` — 从不抛错，失败查询不进 dehydrate
- `queryClient.fetchQuery(...)` — 会抛错，需要错误响应时用
- `useSuspenseQuery` — 配合流式 / 实验版零 prefetch
- `SWRConfig.fallback` / `unstable_serialize` — SWR 预取数据注入
- Next.js `<Suspense>` / `loading.js` — 流式渲染边界
- React `use(promise)` — Client 解析 Server 传来的 promise

## 注意事项
- **TanStack QueryClient 不要设 `gcTime: 0`**，会引发水合错误；最小 `2000`
- **Next.js rewrites + 静态优化** 会让 React Query 二次水合，丢失引用相等性，破坏 `useEffect`/`useMemo` 依赖
- **序列化黑名单**：`undefined` / `Error` / `Date` / `Map` / `Set` / `BigInt` / `Infinity` / `NaN` / `RegExp` 默认不可 dehydrate，自定义场景用 `serializeData`/`deserializeData` + devalue 库（别用 `JSON.stringify`，有 XSS 风险）
- **不要**在 RSC 用 `queryClient.fetchQuery` 后把结果渲染或 pass 给 Client Component——客户端 revalidate 时 Server Component 无法同步，会数据漂移。RSC 只做 prefetch
- Pages Router 用 `initialData` 捷径：不能覆盖已有缓存，且无 server 时间戳
- **`initialData` 永远不会覆盖已有缓存**
- SWR `fallback` 的 key 与 `useSWR` key 必须完全一致（数组/函数 key 走 `unstable_serialize`）

## 组合提示
- 与客户端全局状态结合参考 `nextjs-state-management`
- Server Action mutation 后用 `revalidatePath`/`revalidateTag` 失效原生 fetch 缓存
- 错误监控接入参考 `nextjs-monitoring`
