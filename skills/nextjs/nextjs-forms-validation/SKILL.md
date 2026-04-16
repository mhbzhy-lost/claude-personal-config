---
name: nextjs-forms-validation
description: "Next.js 15 表单处理：Server Actions 表单集成、useActionState/useFormStatus、Zod 校验、渐进增强、文件上传。"
tech_stack: [nextjs]
language: [typescript]
---

# Next.js 15 表单处理与校验

> 来源：https://nextjs.org/docs/app/guides/forms
> https://nextjs.org/docs/app/getting-started/mutating-data

## 用途

在 Next.js App Router 中构建表单：Server Action 接收提交、Zod 服务端校验、useActionState 回显错误与 pending、useOptimistic 乐观更新，且零 JS 时仍可提交（渐进增强）。

## 何时使用

- 任何带表单提交的页面（注册、登录、CRUD）
- 服务端校验 + 前端错误回显
- 文件上传、乐观更新

## Server Action + Form 基础

Server Component 中的表单天然支持渐进增强——JS 未加载时回退为原生 POST。

```tsx
// app/posts/page.tsx — Server Component
import { createPost } from './actions';

export default function Page() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <textarea name="content" />
      <button type="submit">发布</button>
    </form>
  );
}
```

```ts
// app/posts/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;
  // 写入数据库...
  revalidatePath('/posts');
  redirect('/posts'); // 必须在 try/catch 之外，内部用 throw 实现
}
```

## useActionState — 错误回显与 pending

React 19 / Next 15 用 `useActionState` 替代旧的 `useFormState`。

```ts
const [state, formAction, isPending] = useActionState(action, initialState);
// state: 上次 action 返回值 | formAction: 传给 <form action> | isPending: 执行中
// action 签名变为 (prevState, formData) => newState
```

```tsx
// app/posts/CreateForm.tsx
'use client';
import { useActionState } from 'react';
import { createPost } from './actions';

type FormState = {
  errors?: { title?: string[]; content?: string[] };
  message?: string;
} | null;

export default function CreateForm() {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createPost, null,
  );
  return (
    <form action={formAction}>
      <input id="title" name="title" required />
      {state?.errors?.title && (
        <p className="text-red-500">{state.errors.title.join(', ')}</p>
      )}
      <textarea id="content" name="content" />
      {state?.errors?.content && (
        <p className="text-red-500">{state.errors.content.join(', ')}</p>
      )}
      {state?.message && <p aria-live="polite">{state.message}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? '提交中...' : '发布'}
      </button>
    </form>
  );
}
```

## useFormStatus — 子组件获取 pending

必须在 `<form>` 内的**子组件**中调用，不能在定义 form 的同一组件中使用。

```tsx
// app/ui/SubmitButton.tsx
'use client';
import { useFormStatus } from 'react-dom';

export function SubmitButton({ label = '提交' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? '处理中...' : label}
    </button>
  );
}
// 使用：<form action={action}><SubmitButton label="注册" /></form>
```

## Zod 服务端校验（完整模式）

```ts
// app/posts/actions.ts
'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const PostSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(200, '标题不超过 200 字'),
  content: z.string().min(10, '内容至少 10 个字符'),
});

type FormState = {
  errors?: { title?: string[]; content?: string[] };
  message?: string;
} | null;

// 第一个参数是 prevState（useActionState 要求）
export async function createPost(
  prevState: FormState, formData: FormData,
): Promise<FormState> {
  const parsed = PostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }
  try {
    // await db.post.create({ data: parsed.data });
  } catch {
    return { message: '数据库写入失败，请重试' };
  }
  // redirect 必须在 try/catch 之外
  revalidatePath('/posts');
  redirect('/posts');
}
```

`safeParse` 返回 `{ success, data, error }`；`error.flatten().fieldErrors` 得到 `Record<string, string[]>`，方便逐字段渲染。

## 乐观更新 — useOptimistic

```tsx
'use client';
import { useOptimistic } from 'react';
import { sendMessage } from './actions';

type Message = { id: string; text: string; sending?: boolean };

export function Chat({ messages }: { messages: Message[] }) {
  const [optimistic, addOptimistic] = useOptimistic<Message[], string>(
    messages,
    (state, newText) => [
      ...state,
      { id: crypto.randomUUID(), text: newText, sending: true },
    ],
  );
  const formAction = async (formData: FormData) => {
    const text = formData.get('text') as string;
    addOptimistic(text);     // 立即显示
    await sendMessage(text); // 服务端写入，revalidate 后真实数据替换
  };
  return (
    <>
      <ul>
        {optimistic.map((m) => (
          <li key={m.id} style={{ opacity: m.sending ? 0.6 : 1 }}>{m.text}</li>
        ))}
      </ul>
      <form action={formAction}>
        <input name="text" required />
        <button type="submit">发送</button>
      </form>
    </>
  );
}
```

## 文件上传

```ts
// app/upload/actions.ts
'use server';
export async function uploadFile(_prev: any, formData: FormData) {
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { error: '请选择文件' };
  if (file.size > 5 * 1024 * 1024) return { error: '文件不得超过 5 MB' };
  const buffer = Buffer.from(await file.arrayBuffer());
  // 写入存储（本地 / S3 / R2）...
  return { url: `/uploads/${file.name}` };
}
```

```tsx
// 前端：useActionState(uploadFile, null) 配合 <input type="file" name="file" />
```

默认 body 上限 1 MB，大文件需配置：

```js
// next.config.js
module.exports = {
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
};
```

## 多 submit 按钮与 .bind()

```tsx
{/* formAction 属性区分不同操作 */}
<form>
  <input name="title" />
  <button formAction={saveDraft}>保存草稿</button>
  <button formAction={publish}>发布</button>
</form>

{/* .bind() 传递表单外的额外参数 */}
const deleteWithId = deletePost.bind(null, postId);
// action 签名变为：(id: string, formData: FormData) => void
<form action={deleteWithId}><button type="submit">删除</button></form>
```

## 客户端即时校验 + 服务端最终校验

推荐模式：前端用 HTML 属性（`required`、`type="email"`）+ onBlur 做即时反馈，后端始终用 Zod 做权威校验。两层错误分开渲染：

```tsx
'use client';
import { useState } from 'react';
import { useActionState } from 'react';
import { register } from './actions';

export function RegisterForm() {
  const [clientErr, setClientErr] = useState('');
  const [state, formAction, isPending] = useActionState(register, null);
  return (
    <form action={formAction}>
      <input name="email" type="email" required
        onBlur={(e) => {
          const v = e.target.value;
          setClientErr(v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '邮箱格式不正确' : '');
        }}
      />
      {clientErr && <p className="text-amber-500">{clientErr}</p>}
      {state?.errors?.email && <p className="text-red-500">{state.errors.email.join(', ')}</p>}
      <button type="submit" disabled={isPending}>注册</button>
    </form>
  );
}
```

## 关键 API（摘要）

| API | 来源 | 说明 |
|-----|------|------|
| `useActionState(action, init)` | `react` | action 返回值 + isPending |
| `useFormStatus()` | `react-dom` | form 子组件获取 pending / data |
| `useOptimistic(state, updateFn)` | `react` | 乐观更新 UI |
| `revalidatePath(path)` | `next/cache` | 按路径失效缓存 |
| `revalidateTag(tag)` | `next/cache` | 按 tag 失效缓存 |
| `redirect(url)` | `next/navigation` | 服务端重定向（throw 实现） |
| `z.safeParse()` | `zod` | 安全校验，不抛异常 |

## 常见陷阱

- **`useFormState` 已弃用** — React 19 / Next 15 统一用 `useActionState`（从 `react` 导入，非 `react-dom`）
- **`redirect()` 在 try/catch 内被吞** — 内部 throw 特殊错误，被 catch 拦截则不跳转；务必放在 try/catch 之外
- **`useFormStatus` 作用域** — 必须在 `<form>` 子组件中调用，同一组件中调用拿不到状态
- **忘记 revalidate** — action 写入后不调 `revalidatePath`/`revalidateTag`，页面显示旧缓存
- **action 返回值含敏感信息** — 返回值会序列化到客户端，不要返回密钥或完整数据库行
- **文件上传超限** — 默认 body 限制 1 MB，需配置 `serverActions.bodySizeLimit`
- **`Object.fromEntries(formData)` 含内部属性** — 带 `$ACTION_` 前缀字段，不要直接透传给数据库

## 组合提示

与 `nextjs-server-actions`（action 定义与安全）、`nextjs-data-fetching`（缓存失效）、`nextjs-navigation`（redirect 后客户端导航）搭配。
