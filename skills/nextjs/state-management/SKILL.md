---
name: nextjs-state-management
description: 在 Next.js（App Router / Pages Router）中正确集成 Zustand、Redux Toolkit、Jotai 的 per-request store 与 SSR 水合模式
tech_stack: [nextjs]
language: [typescript]
capability: [state-management]
version: "nextjs unversioned; zustand unversioned; redux-toolkit unversioned; jotai unversioned"
collected_at: 2026-04-18
---

# Next.js 客户端状态管理（Zustand / Redux Toolkit / Jotai）

> 来源：zustand.docs.pmnd.rs/learn/guides/nextjs、redux-toolkit.js.org/usage/nextjs、jotai.org/docs/guides/nextjs

## 用途
在 Next.js SSR / App Router 环境里安全使用客户端 store，避免跨请求共享、水合不一致、RSC 误用 store 三大陷阱。

## 何时使用
- 需要在 Next.js 多请求服务器上做全局可变状态管理
- 需要从 Server Component 预取数据并注入到 Client Component 的 store
- 需要与路由 / URL hash 同步的细粒度原子状态（Jotai）
- Pages Router 迁移到 App Router 时重新整理 store 架构

## 核心原则（三库通用）
1. **禁止模块级全局 store**：每个请求新建一个 store，否则不同用户/请求会串数据
2. **RSC 不读写 store**：RSC 无 hooks / context，进 store 必经 Client Component
3. **store 初始化必须在 Client Provider 内**（`'use client'`），用 `useState(() => ...)` 或 `useRef` 保证仅创建一次
4. **初始数据从 Server 传入 props**，在 Provider 内 dispatch/hydrate，避免 `useEffect` 水合错误

## Zustand — Provider 模式（推荐）

`stores/counter-store.ts`：用 `createStore`（vanilla）而非 `create`，返回工厂函数：

```ts
import { createStore } from 'zustand/vanilla'

export const createCounterStore = (initState = { count: 0 }) =>
  createStore<CounterStore>()((set) => ({
    ...initState,
    incrementCount: () => set((s) => ({ count: s.count + 1 })),
    decrementCount: () => set((s) => ({ count: s.count - 1 })),
  }))
```

`providers/counter-store-provider.tsx`（Client Component）：

```tsx
'use client'
import { createContext, useContext, useState } from 'react'
import { useStore } from 'zustand'

const Ctx = createContext<ReturnType<typeof createCounterStore> | undefined>(undefined)

export const CounterStoreProvider = ({ children }) => {
  const [store] = useState(() => createCounterStore())
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export const useCounterStore = <T,>(selector: (s: CounterStore) => T) => {
  const store = useContext(Ctx)
  if (!store) throw new Error('must be used within CounterStoreProvider')
  return useStore(store, selector)
}
```

挂在 `app/layout.tsx`（全局）或具体 `page.tsx`（按路由隔离）。

## Redux Toolkit — per-request makeStore

```ts
// lib/store.ts
export const makeStore = () => configureStore({ reducer: {...} })
export type AppStore = ReturnType<typeof makeStore>
```

```ts
// lib/hooks.ts — 使用 .withTypes 获取类型化 hooks
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
export const useAppStore = useStore.withTypes<AppStore>()
```

```tsx
// app/StoreProvider.tsx
'use client'
export default function StoreProvider({ count, children }) {
  const ref = useRef<AppStore | null>(null)
  if (!ref.current) {
    ref.current = makeStore()
    ref.current.dispatch(initializeCount(count)) // 初始数据
  }
  return <Provider store={ref.current}>{children}</Provider>
}
```

**按路由初始化数据**（不要用 `useEffect`，会引发水合错误）：

```tsx
const store = useAppStore()
const initialized = useRef(false)
if (!initialized.current) {
  store.dispatch(initializeProduct(product))
  initialized.current = true
}
```

**缓存策略**：用户相关路由设 `export const dynamic = 'force-dynamic'`；mutation 后用 `revalidatePath`/`revalidateTag` 失效缓存。**RTK Query 只用于客户端 fetching**，服务端走 async RSC + `fetch`。

**目录建议**：Redux 逻辑放 `/lib/features/*`，与 `/app` 解耦。

## Jotai — Provider + 水合

SSR 必须包 `<Provider>` 隔离请求生命周期（尽管 Jotai 默认 provider-less）。

**URL hash 同步**：

```ts
const pageAtom = atomWithHash('page', 1, { replaceState: true })
```

**SSR 水合**：禁止在 atom 里直接 return promise，用 `useHydrateAtoms` 注入服务端预取值；SSR 内先返回 `prefetchedData || EMPTY` 再在 client 接管。

**Next.js 13+ 陷阱**：`Router.events.on()` 在 App Router 不再暴露，`atomWithHash` 仅在整页刷新时加载；务必配 `replaceState: true` 以允许浏览器后退。

## 注意事项
- **不要把 `useEffect` 用于初始化 store**——它只在客户端跑，服务端渲染出的 HTML 与客户端首渲染不一致会炸水合
- **Provider 组件必须 `'use client'`**，且要 re-render safe（`useState` 惰性初始化 / `useRef` 判空）
- Pages Router 与 App Router 用法几乎一致，区别仅在挂载点（`_app.tsx` vs `app/layout.tsx`）
- **按路由 store** 只在真正需要重置时使用，否则挂 layout 即可

## 组合提示
- 服务端数据获取走 Server Component + `fetch`，client 侧 fetching 用 SWR / TanStack Query，参考 `nextjs-http-client`
- 与 URL 查询参数/表单状态协同时，优先用 Next.js 原生 `searchParams` 而非 store
