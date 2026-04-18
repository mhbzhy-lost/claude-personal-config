---
name: nextjs-server-actions
description: "Next.js 15 Server Actions：定义、表单集成、useActionState/useFormStatus、校验、重定向、权限。"
tech_stack: [nextjs, react, frontend]
language: [typescript]
capability: [web-framework, form-validation]
---

# Server Actions（Next.js 15）

> 来源：https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations

## 用途

从 Client Component 或 `<form>` 里直接调用运行在服务端的函数，完成写入 / 变更，并与 Next 的缓存失效、重定向一体化。

## 何时使用

- 表单提交（增删改）
- 任何需要在客户端触发的服务端副作用
- 想避免手写 `app/api/.../route.ts` 做 CRUD

## 定义 Action

```ts
// app/todos/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';

const Schema = z.object({ title: z.string().min(1).max(200) });

export async function createTodo(formData: FormData) {
  const parsed = Schema.safeParse({ title: formData.get('title') });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  await db.todo.create({ data: parsed.data });
  revalidatePath('/todos');
  redirect('/todos');
}
```

## 在 `<form>` 中使用（零 JS 也能跑）

```tsx
// app/todos/page.tsx  — Server Component
import { createTodo } from './actions';

export default function Page() {
  return (
    <form action={createTodo}>
      <input name="title" required />
      <button type="submit">创建</button>
    </form>
  );
}
```

## 配合 `useActionState`（React 19）获取返回值

```tsx
// app/todos/NewTodo.tsx
'use client';
import { useActionState } from 'react';
import { createTodo } from './actions';

type State = { error?: Record<string, string[]> } | null;

export default function NewTodo() {
  const [state, formAction, isPending] = useActionState<State, FormData>(
    async (_prev, formData) => await createTodo(formData),
    null
  );
  return (
    <form action={formAction}>
      <input name="title" />
      {state?.error?.title && <p>{state.error.title.join(', ')}</p>}
      <button disabled={isPending}>提交</button>
    </form>
  );
}
```

注：`useFormState` 是 `useActionState` 的旧名，React 19 / Next 15 统一使用 `useActionState`。

## `useFormStatus`：按钮 pending 态

```tsx
'use client';
import { useFormStatus } from 'react-dom';

export function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? '提交中...' : '提交'}</button>;
}
```

`useFormStatus` 必须在 `<form>` 内的子组件中使用。

## 非表单调用

```tsx
'use client';
import { deleteTodo } from './actions';

export function DeleteButton({ id }: { id: string }) {
  return (
    <button onClick={async () => { await deleteTodo(id); }}>
      删除
    </button>
  );
}
```

Action 第一个参数不必是 `FormData`，任意可序列化参数都可以。

## `.bind()` 传递额外参数

```tsx
// 在 server component 中：
const deleteWithId = deleteTodo.bind(null, id);
return <form action={deleteWithId}>...</form>;
```

## 重定向

```ts
'use server';
import { redirect } from 'next/navigation';
export async function go() {
  redirect('/dashboard');  // 抛出特殊错误，不要 try/catch 包它
}
```

`redirect()` 内部用 throw 实现，务必放在 `try/catch` 之外，或重新 throw。

## 权限 / 安全

Server Action 是**公开的 POST 端点**：

- 必须在 action 内部重新校验身份与权限，不能相信 client
- 对所有入参做 schema 校验（zod / valibot）
- 不要把敏感字段直接透传给 DB（只取白名单字段）
- CSRF：Next 对 Server Action 内建 Origin 校验，但跨子域仍需配置 `serverActions.allowedOrigins`

```ts
'use server';
export async function deletePost(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  const post = await db.post.findUnique({ where: { id } });
  if (post?.authorId !== user.id) throw new Error('FORBIDDEN');
  await db.post.delete({ where: { id } });
}
```

## 关键 API（摘要）

- `"use server"` — 文件或函数顶部指令
- `useActionState(actionFn, initialState)` from `'react'`
- `useFormStatus()` from `'react-dom'`
- `revalidatePath()` / `revalidateTag()` / `redirect()` / `permanentRedirect()` / `notFound()`

## 常见陷阱

- 用了 `useFormState`（旧名）报 deprecated → 改用 `useActionState`
- 在 action 里 `try { redirect(...) } catch { ... }` → `redirect` 被吞掉，页面不跳转
- 忘记 `revalidatePath`/`revalidateTag` → 列表页缓存还是旧数据
- Action 参数包含不可序列化内容（函数、File 以外的复杂对象）会报错；文件用 `FormData` 的 `File`
- 不要把密钥写进 action 返回值——客户端会拿到

## 组合提示

与 `nextjs-data-fetching`（失效）、`nextjs-navigation`（`redirect` 后客户端导航）、`nextjs-forms-validation`（表单 UI 侧：useActionState 错误回显、Zod 校验、文件上传）搭配。
