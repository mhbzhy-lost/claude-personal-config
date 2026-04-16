---
name: nextjs-auth-patterns
description: "Next.js 15 鉴权集成模式：Auth.js v5 (NextAuth) 配置、session 在 RSC 中读取、受保护路由、中间件网关。"
tech_stack: [nextjs]
language: [typescript]
---

# Next.js 鉴权模式

> 来源：https://authjs.dev/getting-started/installation?framework=next.js
> https://nextjs.org/docs/app/building-your-application/authentication

## 用途

把鉴权（登录、会话、权限）集成到 App Router，核心是在 RSC、Server Action、Route Handler、Middleware 四种位置正确读取 session。

## 何时使用

- 新项目选登录方案
- 需要把会话信息带进 RSC 做数据过滤
- 想用 middleware 做粗粒度路由网关

## 方案选型速览

- **Auth.js (NextAuth) v5**：生态成熟，社会化登录、Email、Credentials 全支持；v5 为 App Router 重写
- **Clerk / Supabase Auth / WorkOS**：托管方案，UI 组件现成，省心但要付费
- **自建 session（cookie + DB）**：最大控制力，写 middleware + Route Handler + server utils

以下以 Auth.js v5 为主线。

## Auth.js v5 基础结构

```bash
npm install next-auth@beta     # v5 仍以 beta 标签发布
```

```ts
// auth.ts（项目根）
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  // session: { strategy: 'jwt' }, // 默认 jwt
  // callbacks: { session({ session, token }) { ... } },
});
```

```ts
// app/api/auth/[...nextauth]/route.ts
export { GET, POST } from '@/auth';
```

```ts
// middleware.ts
export { auth as middleware } from '@/auth';

export const config = { matcher: ['/dashboard/:path*'] };
```

`NEXTAUTH_SECRET` / `AUTH_SECRET`（v5 改名）与 provider 的 client id/secret 放到 `.env.local`。

## 在 RSC 中读 session

```tsx
// app/dashboard/page.tsx
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <p>你好，{session.user.name}</p>;
}
```

## 在 Server Action 中读 session

```ts
'use server';
import { auth } from '@/auth';

export async function deletePost(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  // ...
}
```

## 在 Route Handler 中读 session

```ts
// app/api/me/route.ts
import { auth } from '@/auth';
export async function GET() {
  const session = await auth();
  return Response.json({ session });
}
```

## Middleware 网关

```ts
// middleware.ts
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname.startsWith('/dashboard')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
});

export const config = { matcher: ['/dashboard/:path*', '/settings/:path*'] };
```

注意：middleware 在 Edge runtime，**不要在 Auth.js 配置中用依赖 Node 原生模块的 adapter**（如某些 DB adapter）。解决方案：
- `session.strategy = 'jwt'`，不依赖 DB 验证 session
- 或把 full config 放到 `auth.config.ts` 且避免 node 依赖，完整 config 只在 RSC 侧使用

```ts
// auth.config.ts — edge 安全的最小 config
import type { NextAuthConfig } from 'next-auth';
export default { providers: [] } satisfies NextAuthConfig;

// auth.ts
import NextAuth from 'next-auth';
import authConfig from './auth.config';
import GitHub from 'next-auth/providers/github';
export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [GitHub],
});
```

## Client Component 中登录 / 登出

```tsx
'use client';
import { signIn, signOut } from 'next-auth/react';
export function AuthButtons() {
  return (
    <>
      <button onClick={() => signIn('github')}>GitHub 登录</button>
      <button onClick={() => signOut()}>登出</button>
    </>
  );
}
```

或在 Server Action 中调用 server 端的 `signIn('github')` 后走 redirect flow。

## 自建简易 session（概念示例）

```ts
// lib/session.ts
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);
  (await cookies()).set('session', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
}

export async function getSession() {
  const token = (await cookies()).get('session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch { return null; }
}
```

## 关键 API（摘要）

- Auth.js v5：`NextAuth()` → `{ handlers, auth, signIn, signOut }`
- `auth()` → 在 RSC / Server Action / Route Handler / Middleware 里读 session
- `next-auth/react` → client `signIn` / `signOut` / `useSession`
- 自建：`cookies()`（Next 15 Promise）+ `jose`

## 常见陷阱

- Auth.js v5 的 secret 环境变量名改为 `AUTH_SECRET`（旧名 `NEXTAUTH_SECRET` 仍兼容）
- 在 middleware 里用了含 node-only DB adapter 的完整 config → Edge 构建报错；拆 `auth.config.ts`
- session 依赖 cookie，Next 15 `cookies()` 返回 Promise，必须 `await`
- Server Action 不验证权限就写 DB → 严重安全问题
- 客户端状态（`useSession`）和服务端（`auth()`）可能短暂不一致；关键权限以服务端为准

## 组合提示

与 `nextjs-middleware`（Edge 网关）、`nextjs-server-actions`（action 内鉴权）、`nextjs-route-handlers`（公开 API 校验）一起设计。
