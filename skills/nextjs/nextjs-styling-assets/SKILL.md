---
name: nextjs-styling-assets
description: "Next.js 15 样式与资源：CSS Modules、Tailwind v4、next/image、next/font、public 静态资源。"
tech_stack: [nextjs]
language: [typescript]
---

# 样式、图片与字体（Next.js 15）

> 来源：https://nextjs.org/docs/app/building-your-application/styling
> https://nextjs.org/docs/app/api-reference/components/image
> https://nextjs.org/docs/app/api-reference/components/font

## 用途

让样式、图片、字体按 Next 推荐方式集成，获得自动优化、CLS 防抖与更小的 bundle。

## 何时使用

- 建项目选择样式方案（CSS Modules / Tailwind / CSS-in-JS）
- 展示图片想要自动尺寸 / 懒加载 / 格式转换
- 接入自定义 / Google 字体不希望页面抖动

## 全局 CSS

```tsx
// app/layout.tsx
import './globals.css';
```

全局 CSS 只能在**根 layout** 里 import（或经由其他 import 链最终到根 layout）。

## CSS Modules

```tsx
// app/components/Button.module.css
.primary { background: blue; color: white; }
```

```tsx
// app/components/Button.tsx
import styles from './Button.module.css';
export function Button() {
  return <button className={styles.primary}>OK</button>;
}
```

任意组件文件都可 import；class 名会被 hash。

## Tailwind v4

```bash
npm install tailwindcss @tailwindcss/postcss
```

```js
// postcss.config.mjs
export default { plugins: { '@tailwindcss/postcss': {} } };
```

```css
/* app/globals.css */
@import "tailwindcss";
```

Tailwind v4 用 `@import "tailwindcss"` 取代旧的三条 `@tailwind` 指令，且**不再需要 `tailwind.config.js`**（可用 CSS `@theme` 覆盖设计 token）。

```css
@theme {
  --color-brand: #4f46e5;
}
```

## CSS-in-JS（需客户端）

styled-components / emotion 等 runtime CSS-in-JS 需要放到 Client Component 中，并配置 registry 避免 FOUC。Next 14+ 推荐用 `@emotion/react` + `@emotion/styled` 或切到 Tailwind / CSS Modules。如必须 CSS-in-JS，优先选零运行时方案（如 vanilla-extract、Panda、Linaria）。

## `next/image`

```tsx
import Image from 'next/image';

// 本地图（静态 import 自动得到尺寸）
import avatar from '@/public/avatar.png';

export function A() {
  return <Image src={avatar} alt="头像" priority />;
}

// 远程图：必须在 next.config 配置 remotePatterns，并显式 width/height 或 fill
export function Hero() {
  return (
    <Image
      src="https://cdn.example.com/hero.jpg"
      alt="Hero"
      width={1200}
      height={630}
      sizes="(max-width: 768px) 100vw, 1200px"
    />
  );
}

// 填充容器（容器需 position: relative）
export function Cover() {
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
      <Image src="/cover.jpg" alt="" fill sizes="100vw" />
    </div>
  );
}
```

常用 props：
- `src` / `alt`（必填）
- `width` + `height` **或** `fill`
- `priority` — 首屏大图关掉懒加载并提前预载
- `sizes` — 响应式必填，告诉浏览器选哪个分辨率
- `quality`（默认 75）
- `placeholder="blur"` + `blurDataURL` 或静态 import 自动获取 blur

```ts
// next.config.ts — 允许远程域
export default {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.example.com' }],
    formats: ['image/avif', 'image/webp'],
  },
};
```

## `next/font`

```tsx
// app/layout.tsx
import { Inter, Noto_Sans_SC } from 'next/font/google';
import localFont from 'next/font/local';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const zh = Noto_Sans_SC({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-zh' });
const myFont = localFont({
  src: './fonts/MyFont.woff2',
  variable: '--font-my',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${zh.variable} ${myFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

```css
body { font-family: var(--font-inter), var(--font-zh), sans-serif; }
```

好处：自动托管、零布局抖动、无额外网络请求到 Google。

## public/ 静态资源

放到 `public/foo.png`，用 `/foo.png` 引用。不会经过打包，直接 CDN 化。

## 关键 API（摘要）

- `import './x.css'` / `import s from './x.module.css'`
- `<Image>` from `'next/image'`：`src, alt, width, height, fill, sizes, priority, placeholder, quality`
- `next/font/google` 与 `next/font/local`
- `next.config.ts` → `images.remotePatterns`、`images.formats`

## 常见陷阱

- 远程图片忘配 `remotePatterns` → 运行时报 `Invalid src prop`
- `<Image fill>` 的父元素没设 `position: relative` 和明确尺寸/aspect-ratio → 图看不见
- 忘了 `sizes` → Next 会下发过大分辨率，白白传字节
- 把 Tailwind v3 的 `@tailwind base; @tailwind components; @tailwind utilities;` 放到 v4 里 → 样式不生效，改 `@import "tailwindcss"`
- Google Font 的 `subsets` 必须显式写；中文字体体积大，建议用 `display: 'swap'` 与 `variable`
- 全局 CSS 从非根 layout 或组件 import → 构建报错

## 组合提示

与 `nextjs-deployment-config`（images 远程域、图片优化）、`nextjs-optimization`（脚本加载策略、懒加载、字体优化进阶）联动。
