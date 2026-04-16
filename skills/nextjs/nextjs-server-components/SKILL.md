---
name: nextjs-server-components
description: "React Server Components 在 Next.js 15 的使用模型：RSC 默认、'use client' / 'use server' 指令、组件组合模式、props 序列化边界。"
tech_stack: [nextjs]
language: [typescript]
---

# React Server Components（Next.js 15）

> 来源：https://nextjs.org/docs/app/building-your-application/rendering/server-components
> https://nextjs.org/docs/app/building-your-application/rendering/client-components

## 用途

理解"谁在服务器跑、谁在浏览器跑"，以及它们如何组合。RSC 把数据获取与渲染放到服务端，显著减小客户端 bundle。

## 何时使用

- 组件需要直接访问后端资源（数据库、文件系统、私钥）→ Server Component
- 组件需要交互（`onClick`、`useState`、浏览器 API）→ Client Component
- 既要数据又要交互 → 服务端组件负责取数，把数据作为 props 传给客户端组件

## 默认行为

App Router 下，`app/` 中的组件**默认是 Server Component**。服务器渲染完成后，只把结果和少量 client component 的 JS 发到浏览器。

```tsx
// app/products/page.tsx — Server Component（默认）
import { db } from '@/lib/db';

export default async function ProductsPage() {
  const products = await db.product.findMany();   // 直接查询 DB
  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}
```

## Client Component

```tsx
// app/components/Counter.tsx
'use client';

import { useState } from 'react';

export default function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}
```

- `"use client"` 必须是文件第一行（注释之后）
- 该文件本身与其**导入的所有模块**都进入 client bundle
- Client Component 内部仍可接收 server-rendered 内容通过 `children`

## 组合模式：server 包 client，或通过 children 混合

**错误示范**：在 client component 文件里 `import` 一个 server component 并渲染。
**正确做法**：由 server component 父组件把 server child 以 `children` / props 形式传入 client。

```tsx
// app/ServerHeader.tsx  — server
export default async function ServerHeader() {
  const user = await getUser();
  return <h1>Hi {user.name}</h1>;
}
```

```tsx
// app/ClientShell.tsx
'use client';
export default function ClientShell({ children }: { children: React.ReactNode }) {
  return <div className="shell">{children}</div>;
}
```

```tsx
// app/page.tsx  — server，将 server child 作为 children 传入 client
import ClientShell from './ClientShell';
import ServerHeader from './ServerHeader';

export default function Page() {
  return (
    <ClientShell>
      <ServerHeader />
    </ClientShell>
  );
}
```

## props 序列化边界

从 server 传给 client 的 props 必须**可序列化**（JSON-like）：
- OK：string、number、boolean、null、数组、纯对象、Date（会被转 string）、`Promise`（React 会在 client await）
- 不 OK：函数、class 实例、Map / Set（除非自己转换）、Symbol、带方法的对象

想让 client 触发服务端逻辑？用 **Server Action**（见 `nextjs-server-actions`），函数由 Next 自动处理。

## "use server"（Server Action 标记，不是组件指令）

```tsx
// app/actions.ts
'use server';

export async function createTodo(formData: FormData) {
  // 运行在服务端，client 可直接 import 并调用
}
```

- `"use server"` 文件顶部 → 导出的**所有函数**都是 Server Action
- 也可在函数体内联：`async function action() { 'use server'; ... }`
- Server Action 可由 client component 直接 `import` 并调用

## 与浏览器 API / 第三方库

- 只在 client component 内访问 `window`、`document`、`localStorage`
- 某些只在浏览器工作的库（如 chart.js 初始化、地图 SDK）需要 dynamic import + `ssr: false`（**注意**：在 Next 15，`ssr: false` 只能在 client component 中用）

```tsx
// 需要在 client component 中调用
'use client';
import dynamic from 'next/dynamic';
const Map = dynamic(() => import('./Map'), { ssr: false });
```

## 关键 API（摘要）

- `"use client"` — 文件指令，标记 Client Component 入口
- `"use server"` — 文件 / 函数指令，标记 Server Action
- `import 'server-only'` — 让文件被 client 导入时构建报错（保护后端代码）
- `import 'client-only'` — 反向保护，阻止 server 导入

## 常见陷阱

- 忘了加 `"use client"` 就用 `useState` → 编译错误 "You're importing a component that needs useState"
- 在 client component 里直接 `import` 含 `process.env.SECRET` 的模块 → 机密泄漏进 bundle；用 `server-only` 防御
- 向 Client Component 传递不可序列化的 props（函数、Date 对象的方法）→ 运行时错误或静默失败
- **`"use client"` 不会关闭 SSR**：组件仍在服务端首次渲染，只是同时生成 hydration 代码；"仅浏览器渲染" 需要 `dynamic(..., { ssr: false })`

## 组合提示

与 `nextjs-data-fetching`（在 RSC 里 fetch）、`nextjs-server-actions`（跨界调用）一起用。
