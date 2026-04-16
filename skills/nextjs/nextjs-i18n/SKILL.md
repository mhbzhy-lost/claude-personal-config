---
name: nextjs-i18n
description: "Next.js 15 国际化：子路径路由、中间件 locale 检测、next-intl 集成、翻译文件组织、SEO hreflang。"
tech_stack: [nextjs, react, frontend]
language: [typescript]
---

# Next.js 国际化（i18n）

> 来源：https://nextjs.org/docs/app/guides/internationalization
> https://next-intl.dev/docs/getting-started/app-router

## 用途

为 Next.js App Router 应用配置多语言路由、locale 自动检测、翻译内容管理和 SEO 多语言优化。

## 何时使用

- 应用需要多语言 URL 前缀（`/en/about`、`/zh/about`）
- 需要 `Accept-Language` 自动检测 / 重定向
- 需要管理翻译文件（插值/复数/富文本）
- 需要多语言 `hreflang` 和 sitemap

## 1. App Router i18n 路由结构

所有页面嵌套在 `app/[locale]/` 下：

```
app/[locale]/
├── layout.tsx          # <html lang={locale}>
├── page.tsx
├── about/page.tsx
messages/
├── en.json
├── zh.json
```

### 原生方案（无第三方库）

```tsx
// app/[locale]/dictionaries.ts — 动态 import，仅 Server Component 可用
import 'server-only';
const dictionaries = {
  en: () => import('@/messages/en.json').then((m) => m.default),
  zh: () => import('@/messages/zh.json').then((m) => m.default),
};
export type Locale = keyof typeof dictionaries;
export const hasLocale = (l: string): l is Locale => l in dictionaries;
export const getDictionary = async (l: Locale) => dictionaries[l]();

// app/[locale]/page.tsx — 使用
import { notFound } from 'next/navigation';
import { getDictionary, hasLocale } from './dictionaries';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  return <h1>{dict.home.title}</h1>;
}
```

## 2. Middleware locale 检测

```tsx
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';

const locales = ['en', 'zh'];
const defaultLocale = 'en';

function getLocale(req: NextRequest): string {
  // 优先 cookie，再 Accept-Language
  const cookie = req.cookies.get('NEXT_LOCALE')?.value;
  if (cookie && locales.includes(cookie)) return cookie;
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  return match(new Negotiator({ headers }).languages(), locales, defaultLocale);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (locales.some((l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`)) return;
  req.nextUrl.pathname = `/${getLocale(req)}${pathname}`;
  return NextResponse.redirect(req.nextUrl);
}

export const config = { matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)',] };
```

依赖：`npm install negotiator @formatjs/intl-localematcher && npm install -D @types/negotiator`

## 3. next-intl 集成（推荐）

安装：`npm install next-intl`

### 核心配置（4 个文件）

```tsx
// src/i18n/routing.ts — 集中路由配置
import { defineRouting } from 'next-intl/routing';
export const routing = defineRouting({ locales: ['en', 'zh'], defaultLocale: 'en' });

// src/i18n/request.ts — 请求级配置
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});

// src/i18n/navigation.ts — locale 感知的导航工具
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

// next.config.ts — 注册插件
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
export default createNextIntlPlugin()({} satisfies NextConfig);
```

### Middleware（next-intl 版）

```tsx
// src/middleware.ts
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
export default createMiddleware(routing);
export const config = { matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)',] };
```

### Layout

```tsx
// app/[locale]/layout.tsx
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale); // 必须在任何 next-intl 函数前调用
  return (
    <html lang={locale}>
      <body><NextIntlClientProvider>{children}</NextIntlClientProvider></body>
    </html>
  );
}
```

### 使用翻译

```tsx
// Server Component
import { getTranslations, setRequestLocale } from 'next-intl/server';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('HomePage');
  return <h1>{t('title')}</h1>;
}

// Client Component
'use client';
import { useTranslations } from 'next-intl';
export default function Counter() {
  const t = useTranslations('Counter');
  return <button>{t('increment')}</button>;
}
```

## 4. 翻译内容管理

### JSON 嵌套命名空间

```json
{
  "HomePage": { "title": "Welcome", "description": "Build something amazing" },
  "Auth": { "SignUp": { "title": "Create account", "form": { "email": "Email" } } }
}
```

访问：`t('form.email')` 或 `useTranslations('Auth.SignUp')` 指定命名空间。

### 插值 / 复数 / Select / 富文本

```json
{
  "greeting": "Hello {name}!",
  "followers": "You have {count, plural, =0 {no followers} one {one follower} other {# followers}}.",
  "status": "{gender, select, female {She} male {He} other {They}} liked this.",
  "terms": "Agree to our <link>Terms</link>."
}
```

```tsx
t('greeting', { name: 'Alice' });           // "Hello Alice!"
t('followers', { count: 3580 });             // "You have 3,580 followers."
t('status', { gender: 'female' });           // "She liked this."
t.rich('terms', { link: (chunks) => <a href="/terms">{chunks}</a> });
```

ICU 语法要点：`plural` / `select` 必须包含 `other` 分支；`#` 自动格式化为数字。

## 5. SEO 多语言优化

### hreflang（Metadata API）

```tsx
// app/[locale]/layout.tsx
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return {
    alternates: {
      canonical: `https://example.com/${locale}`,
      languages: { en: 'https://example.com/en', zh: 'https://example.com/zh', 'x-default': 'https://example.com/en' },
    },
  };
}
```

### 多语言 Sitemap

```tsx
// app/sitemap.ts — 为每个 locale x 路径 生成条目
import type { MetadataRoute } from 'next';
const locales = ['en', 'zh'], base = 'https://example.com';
export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/about', '/contact'].flatMap((r) =>
    locales.map((l) => ({
      url: `${base}/${l}${r}`, lastModified: new Date(),
      alternates: { languages: Object.fromEntries(locales.map((ll) => [ll, `${base}/${ll}${r}`])) },
    })),
  );
}
```

### 本地化 Metadata（next-intl `getTranslations`）

```tsx
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'Metadata' });
  return { title: t('title'), description: t('description') };
}
```

## 6. 语言切换组件

```tsx
'use client';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
const names: Record<string, string> = { en: 'English', zh: '中文' };

export default function LocaleSwitcher() {
  const locale = useLocale(), router = useRouter(), pathname = usePathname();
  return (
    <select value={locale} onChange={(e) => router.replace(pathname, { locale: e.target.value })}>
      {routing.locales.map((l) => <option key={l} value={l}>{names[l]}</option>)}
    </select>
  );
}
```

## 关键 API（摘要）

| API | 来源 | 说明 |
|---|---|---|
| `useTranslations(ns)` | `next-intl` | Client/Server Component 翻译 hook |
| `getTranslations(ns)` | `next-intl/server` | Server Component 异步翻译 |
| `setRequestLocale(locale)` | `next-intl/server` | 启用静态渲染，layout/page 顶部调用 |
| `defineRouting()` | `next-intl/routing` | 集中定义 locales 与 defaultLocale |
| `createMiddleware(routing)` | `next-intl/middleware` | locale 自动检测中间件 |
| `createNavigation(routing)` | `next-intl/navigation` | locale 感知的 Link/useRouter |
| `NextIntlClientProvider` | `next-intl` | Client Component 翻译上下文 |
| `t.rich(key, tags)` / `t.has(key)` | `next-intl` | 富文本渲染 / 检查键是否存在 |

## 常见陷阱

- **忘记 `setRequestLocale`**：每个 layout/page 顶部调用，否则静态渲染失败
- **忘记 `generateStaticParams`**：未返回 locale 列表 -> 动态路由无法静态生成
- **params 未 await**：Next.js 15+ `params` 是 Promise，不 await 得到 `[object Promise]`
- **matcher 遗漏排除项**：未排 `_next` / 静态资源 -> CSS/JS 被拦截白屏
- **翻译 key 不同步**：新增 key 只加一种语言，运行时显示 raw key
- **Client 中用 `getTranslations`**：server-only API，客户端必须用 `useTranslations`
- **ICU `other` 缺失**：`plural`/`select` 必须有 `other` 分支，否则解析报错
- **翻译文件过大**：`NextIntlClientProvider` 默认传全部消息到客户端；按页面拆分命名空间

## 组合提示

与 `nextjs-middleware`（locale 检测）、`nextjs-metadata-seo`（hreflang / OG）、`nextjs-routing`（`[locale]` 段）一起使用。
