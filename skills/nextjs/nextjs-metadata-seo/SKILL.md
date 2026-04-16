---
name: nextjs-metadata-seo
description: "Next.js 15 元数据与 SEO：Metadata API、generateMetadata、文件约定（sitemap/robots/opengraph-image）、JSON-LD 结构化数据。Use when optimizing a Next.js app for search engines and social sharing."
tech_stack: [nextjs]
---

# Next.js 元数据与 SEO

> 来源：https://nextjs.org/docs/app/building-your-application/optimizing/metadata
> https://nextjs.org/docs/app/api-reference/functions/generate-metadata
> https://nextjs.org/docs/app/api-reference/file-conventions/metadata

## 用途

通过 Metadata API 和文件约定为 Next.js 应用配置 SEO 元数据、Open Graph 社交分享、站点地图和结构化数据。

## 何时使用

- 为页面设置 title / description / keywords 等基础 SEO 元数据
- 根据动态路由参数生成不同的元数据（如博客文章标题）
- 配置 Open Graph / Twitter Card 社交分享图片
- 生成 sitemap.xml、robots.txt 让搜索引擎爬取
- 注入 JSON-LD 结构化数据提升搜索结果富文本展示

## 1. 静态 Metadata

从 `layout.tsx` 或 `page.tsx` 导出 `metadata` 对象：

```tsx
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  // metadataBase 让相对 URL 正确解析为绝对 URL
  metadataBase: new URL('https://acme.com'),
  title: {
    default: 'Acme',          // 子路由未定义 title 时的回退
    template: '%s | Acme',     // 子路由 title 自动追加后缀
  },
  description: 'Acme — 构建更好的产品',
  keywords: ['Next.js', 'React', 'SEO'],
  authors: [{ name: 'Acme Team', url: 'https://acme.com' }],
  openGraph: {
    title: 'Acme',
    description: 'Acme — 构建更好的产品',
    url: 'https://acme.com',
    siteName: 'Acme',
    locale: 'zh_CN',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Acme',
    description: 'Acme — 构建更好的产品',
    creator: '@acme',
    images: ['/og.png'],
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: '/',
    languages: { 'en-US': '/en-US', 'zh-CN': '/zh-CN' },
  },
  verification: {
    google: 'google-verification-code',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
```

子路由仅需设置自己的 title，`template` 会自动拼接：

```tsx
// app/about/page.tsx — 输出：<title>关于我们 | Acme</title>
export const metadata: Metadata = { title: '关于我们' };

// 若要忽略父级 template — 输出：<title>独立标题</title>
export const metadata: Metadata = { title: { absolute: '独立标题' } };
```

## 2. 动态 Metadata（generateMetadata）

**Next.js 15+：`params` 和 `searchParams` 都是 Promise，必须 await。**

```tsx
// app/blog/[slug]/page.tsx
import type { Metadata, ResolvingMetadata } from 'next';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata(
  { params, searchParams }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await params;

  // fetch 在 generateMetadata 与页面组件间自动去重
  const post = await fetch(`https://api.acme.com/posts/${slug}`).then((r) => r.json());

  // 可继承并扩展父级 metadata
  const previousImages = (await parent).openGraph?.images || [];

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage, ...previousImages],
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = await fetch(`https://api.acme.com/posts/${slug}`).then((r) => r.json());
  return <article>{post.content}</article>;
}
```

### 请求去重

`generateMetadata` 内的 `fetch` 与同一 URL 的页面 `fetch` 自动合并。如果不用 `fetch`（如直接查数据库），用 React `cache` 包装：

```tsx
// app/lib/data.ts
import { cache } from 'react';
import { db } from '@/lib/db';

export const getPost = cache(async (slug: string) => {
  return db.query.posts.findFirst({ where: eq(posts.slug, slug) });
});
```

### 与 generateStaticParams 配合

```tsx
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await db.query.posts.findMany({ columns: { slug: true } });
  return posts.map((post) => ({ slug: post.slug }));
}

// generateMetadata + 页面组件复用同一 getPost()
```

## 3. 文件约定元数据

### favicon / icon / apple-icon

将文件放在 `app/` 根目录：`favicon.ico`、`icon.png`、`apple-icon.png`。
或用代码动态生成：

```tsx
// app/icon.tsx — 动态生成 favicon
import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div style={{ fontSize: 24, width: '100%', height: '100%', display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff' }}>
      A
    </div>,
    { ...size },
  );
}
```

### opengraph-image.tsx（动态 OG 图）

```tsx
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';
import { getPost } from '@/lib/data';

export const alt = 'Blog Post Cover';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Next.js 15+：params 是 Promise
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  return new ImageResponse(
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#fff', padding: 60,
    }}>
      <div style={{ fontSize: 60, fontWeight: 'bold', textAlign: 'center' }}>
        {post.title}
      </div>
      <div style={{ fontSize: 30, marginTop: 20, opacity: 0.8 }}>
        acme.com/blog
      </div>
    </div>,
    { ...size },
  );
}
```

ImageResponse 仅支持 flexbox 布局和有限 CSS（不支持 `display: grid`）。

### sitemap.ts

```tsx
// app/sitemap.ts
import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await fetch('https://api.acme.com/posts').then((r) => r.json());

  const postEntries: MetadataRoute.Sitemap = posts.map((post: any) => ({
    url: `https://acme.com/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    { url: 'https://acme.com', lastModified: new Date(), changeFrequency: 'yearly', priority: 1 },
    { url: 'https://acme.com/about', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    ...postEntries,
  ];
}
```

大型站点用 `generateSitemaps` 拆分（Google 限制 50,000 URL/文件）：

```tsx
// app/product/sitemap.ts
import type { MetadataRoute } from 'next';

export async function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }, { id: 2 }]; // 生成 /product/sitemap/0.xml 等
}

export default async function sitemap(
  props: { id: Promise<string> },
): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  const start = id * 50000;
  const products = await getProducts(start, 50000);
  return products.map((p) => ({
    url: `https://acme.com/product/${p.id}`,
    lastModified: p.updatedAt,
  }));
}
```

### robots.ts

```tsx
// app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/private/', '/admin/'] },
      { userAgent: 'Googlebot', allow: '/' },
    ],
    sitemap: 'https://acme.com/sitemap.xml',
  };
}
```

### manifest.ts

```tsx
// app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Acme App',
    short_name: 'Acme',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  };
}
```

## 4. JSON-LD 结构化数据

在 `page.tsx` 中直接注入 `<script type="application/ld+json">`：

```tsx
// app/blog/[slug]/page.tsx
import { getPost } from '@/lib/data';

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage,
    datePublished: post.createdAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Person', name: post.author.name },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article>{post.content}</article>
    </>
  );
}
```

**其他常见 Schema 示例**：

```tsx
// Product
const productLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Widget',
  image: 'https://acme.com/widget.jpg',
  offers: { '@type': 'Offer', price: '29.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
};

// BreadcrumbList
const breadcrumbLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: '首页', item: 'https://acme.com' },
    { '@type': 'ListItem', position: 2, name: '博客', item: 'https://acme.com/blog' },
    { '@type': 'ListItem', position: 3, name: post.title },
  ],
};
```

## 5. viewport 与 themeColor

Next.js 14+ 已将 `viewport` 和 `themeColor` 从 `metadata` 拆出到独立的 `generateViewport`：

```tsx
// app/layout.tsx
import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};
```

## 关键 API（摘要）

| API | 说明 |
|---|---|
| `export const metadata: Metadata` | 静态元数据，layout / page 中导出 |
| `export async function generateMetadata()` | 动态元数据，接收 `params`（Promise）、`parent` |
| `export const viewport: Viewport` | viewport / themeColor 配置（独立于 metadata） |
| `metadataBase` | 设置 URL 基准，让相对路径自动拼为绝对 URL |
| `title.template` | `'%s | Site'` 模式，在 layout 中定义 |
| `title.absolute` | 忽略父级 template |
| `ImageResponse` from `next/og` | 动态生成 OG 图 / icon |
| `MetadataRoute.Sitemap` | sitemap.ts 返回类型 |
| `MetadataRoute.Robots` | robots.ts 返回类型 |

## 常见陷阱

- **忘记 await params**：Next.js 15 的 `generateMetadata` 中 `params` 是 Promise，不 await 会得到 `[object Promise]`
- **metadata 和 generateMetadata 不能共存**：同一路由段只能导出其中一个
- **metadata 仅限 Server Component**：不能在 `'use client'` 文件中导出
- **漏设 metadataBase**：OG image 等使用相对路径时构建报错；在根 layout 设置一次即可
- **title.template 只作用于子路由**：在 `layout.tsx` 定义的 template 不会影响同层的 `page.tsx`
- **openGraph 是浅合并**：子路由设了 `openGraph` 会整体替换父级的 `openGraph`，不会合并字段；需要共享字段请抽取变量后展开
- **viewport / themeColor 放在 metadata 里**：Next.js 14+ 已废弃，必须用独立的 `viewport` 导出
- **OG Image 只支持 flexbox**：`ImageResponse` 不支持 `display: grid`；仅限 flexbox 和部分 CSS 属性
- **文件约定优先级高于代码**：`opengraph-image.png` 文件会覆盖 `metadata.openGraph.images` 配置

## 组合提示

与 `nextjs-routing`（动态路由 params）、`nextjs-data-fetching`（RSC 数据获取）、`nextjs-rendering`（SSG / ISR 预渲染策略配合 generateStaticParams）一起使用。
