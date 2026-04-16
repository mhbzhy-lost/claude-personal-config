---
name: nextjs-middleware
description: "Next.js 15 middleware.ts：matcher、NextResponse、Edge 运行时限制、鉴权网关、重写、A/B。Use when writing middleware.ts for auth gating, rewrites, i18n detection or experiments."
tech_stack: [nextjs]
---

# Middleware（Next.js 15）

> 来源：https://nextjs.org/docs/app/building-your-application/routing/middleware

## 用途

在请求进入路由渲染之前运行一段代码，做鉴权、重写、重定向、注入 header / cookie。

## 何时使用

- 登录网关（未登录重定向到 `/login`）
- 路径重写 / 多语言前缀
- 简单 A/B 分流、地域路由
- 为下游注入请求头（如把 token 解码后传给 RSC）

## 基本结构

```ts
// middleware.ts （项目根或 src/）
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const token = req.cookies.get('session')?.value;

  if (!token && req.nextUrl.pathname.startsWith('/dashboard')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set('x-request-id', crypto.randomUUID());
  return res;
}

export const config = {
  matcher: [
    // 排除 _next、静态资源、API
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
};
```

## matcher 语法

```ts
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/profile',
    {
      source: '/admin/:path*',
      has: [{ type: 'header', key: 'x-admin-request' }],
      missing: [{ type: 'cookie', key: 'nextjs-disable' }],
    },
  ],
};
```

- 支持 `:param`、`:path*`（catch-all）、`:path?`（可选）
- 对象形式可加 `has` / `missing` 条件
- 不声明 `config.matcher` 时 middleware 匹配**所有路径**（含 `_next/*`，通常不是你想要的）

## 常见操作

```ts
// 重定向
NextResponse.redirect(new URL('/login', req.url));

// 重写（客户端 URL 不变，内部渲染另一路径）
NextResponse.rewrite(new URL('/en' + req.nextUrl.pathname, req.url));

// 继续并改 header
const res = NextResponse.next({
  request: { headers: new Headers({ ...Object.fromEntries(req.headers), 'x-user': 'alice' }) },
});
return res;

// 设置 cookie
const res = NextResponse.next();
res.cookies.set('locale', 'zh', { path: '/', httpOnly: false });
return res;

// 直接返回 JSON
return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
```

## Edge runtime 限制

Middleware **强制 Edge runtime**：
- 不能用 Node 内置 `fs`、`child_process`、`net`
- 无法使用依赖这些模块的 npm 包（如某些 ORM、重型 crypto 库）
- 推荐的校验库：`jose`（JWT）、Web Crypto API、`zod`
- 体积上限（约几 MB，包含依赖）

## 鉴权网关示例（JWT）

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', req.url));

  try {
    const { payload } = await jwtVerify(token, secret);
    const res = NextResponse.next();
    res.headers.set('x-user-id', String(payload.sub));
    return res;
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = { matcher: ['/dashboard/:path*', '/settings/:path*'] };
```

## 多语言前缀（简化示例）

```ts
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasLocale = /^\/(en|zh)(\/|$)/.test(pathname);
  if (!hasLocale) {
    const accept = req.headers.get('accept-language') ?? '';
    const locale = accept.startsWith('zh') ? 'zh' : 'en';
    return NextResponse.redirect(new URL(`/${locale}${pathname}`, req.url));
  }
}
```

## 关键 API（摘要）

- `NextRequest` / `NextResponse` from `'next/server'`
- `req.nextUrl`（`URL` 子类，带 pathname/searchParams）、`req.cookies`、`req.headers`、`req.geo`、`req.ip`
- `NextResponse.next()` / `.redirect()` / `.rewrite()` / `.json()`
- `config.matcher`（字符串或对象数组）

## 常见陷阱

- 没设 `matcher` → 拦了 `_next/static`，CSS / JS 请求被挡住，页面白屏
- 在 middleware 里读数据库 → Edge 环境下多数 ORM 不兼容；改放 RSC / route handler
- `NextResponse.redirect()` 传相对路径 → 必须用 `new URL(path, req.url)` 构造绝对 URL
- 修改了 request headers 却用 `NextResponse.rewrite()` 没挂 headers → 用 `NextResponse.next({ request: { headers } })`
- middleware 运行时非常早，`cookies().set()` 只能在 `NextResponse` 上；不要 import server-only 模块

## 组合提示

常与 `nextjs-auth-patterns`（Auth.js）、`nextjs-route-handlers`（公共 API 鉴权）、`nextjs-i18n`（多语言路由检测与重定向）组合。
