---
name: nextjs-route-handlers
description: "Next.js 15 Route Handlers（app/api/.../route.ts）：HTTP 方法导出、Request/Response、动态 vs 静态、流式响应、runtime 选择。Use when building JSON APIs, webhooks, streams or file endpoints."
tech_stack: [nextjs]
---

# Route Handlers（Next.js 15）

> 来源：https://nextjs.org/docs/app/building-your-application/routing/route-handlers

## 用途

在 App Router 下提供 HTTP 接口。对应 Pages Router 的 `pages/api/*`，但基于 Web `Request`/`Response`。

## 何时使用

- 对外 JSON API / Webhook
- 文件下载、SSE、代理
- 需要脱离 RSC 的 fetch 记忆化，或需要手工设置 headers / streaming 时

## 基本结构

```ts
// app/api/hello/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json({ received: body }, { status: 201 });
}
```

支持的方法导出：`GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS`。

## 动态路径参数

```ts
// app/api/users/[id]/route.ts
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }   // Next 15: Promise
) {
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id } });
  if (!user) return new Response('Not Found', { status: 404 });
  return Response.json(user);
}
```

## Query / Headers / Cookies

```ts
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  const cookieStore = await cookies();             // Next 15: 返回 Promise
  const session = cookieStore.get('session')?.value;
  const hdrs = await headers();
  const ua = hdrs.get('user-agent');
  const res = NextResponse.json({ q, session, ua });
  res.cookies.set('visited', '1', { path: '/' });
  return res;
}
```

## 静态 vs 动态

Route Handler **默认静态**（结果会被缓存），触发动态的信号与 page 相同：
- 访问 `request` 的动态属性（`nextUrl.searchParams` / `cookies()` / `headers()`）
- 使用 `POST` 等非 `GET` 方法
- 段级 `export const dynamic = 'force-dynamic'`

```ts
// 强制每次请求都跑
export const dynamic = 'force-dynamic';
export const revalidate = 0;
```

## 流式响应（SSE）

```ts
// app/api/stream/route.ts
export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < 5; i++) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ i })}\n\n`));
        await new Promise((r) => setTimeout(r, 500));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
```

## 返回文件 / 二进制

```ts
export async function GET() {
  const buf = await generatePdfBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="report.pdf"',
    },
  });
}
```

## 文件上传（FormData）

```ts
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return new Response('No file', { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  // 保存到对象存储...
  return Response.json({ size: bytes.byteLength, name: file.name });
}
```

## Runtime 选择

```ts
export const runtime = 'nodejs';   // 默认；完整 Node API
// 或
export const runtime = 'edge';     // 全球低延迟；仅 Web API
```

优先 `nodejs`；只有在需要低冷启动 / 全球边缘时才选 edge，并注意依赖兼容性。

## CORS

没有自动 CORS。手动加：

```ts
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
export async function GET() {
  return new Response('ok', { headers: CORS });
}
```

## 关键 API（摘要）

- `Request` / `Response` (Web standard) + `NextRequest` / `NextResponse`
- Segment config: `dynamic`、`revalidate`、`runtime`、`maxDuration`
- `cookies()` / `headers()` / `draftMode()`（均 Promise，Next 15）
- `NextResponse.json()` / `NextResponse.redirect()` / `NextResponse.rewrite()`

## 常见陷阱

- 一个 `route.ts` 和同目录的 `page.tsx` **不能共存**
- `GET` 不访问动态 API 时默认静态 → 改数据后客户端拿到旧缓存，要么 `force-dynamic`，要么 `revalidateTag`
- 读 body：`await req.json()` / `req.text()` / `req.formData()` **只能调一次**
- `cookies().set()` 在 RSC 中只允许在 Server Action / Route Handler 中调用
- Edge runtime 下不要 import 含 Node 原生模块的包

## 组合提示

与 `nextjs-middleware`（鉴权）、`nextjs-server-actions`（内部变更更常用 Action）搭配；不要用 Route Handler 重复 Server Action 能做的事。
