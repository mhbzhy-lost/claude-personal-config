---
name: tailwindcss-ui-integration
description: 基于 Tailwind CSS 的主流组件/排版生态接入（shadcn/ui、Headless UI、daisyUI、@tailwindcss/typography）
tech_stack: [tailwindcss, shadcn-ui, headlessui, daisyui]
capability: [ui-layout, theming]
version: "shadcn-ui unversioned; headlessui 2.1; daisyui unversioned; tailwindcss-typography unversioned; tailwindcss 4"
collected_at: 2026-04-18
---

# Tailwind CSS UI 生态接入

> 来源：shadcn/ui 官方文档、Headless UI、daisyUI、@tailwindcss/typography README

## 用途
在 Tailwind CSS 项目上按需选型组件库与排版插件：shadcn/ui 提供可复制进仓库的 Radix + Tailwind 组件；Headless UI 提供无样式可访问原语；daisyUI 用一行 `@plugin` 提供成套主题化语义类；`@tailwindcss/typography` 用 `prose` 类一键美化 Markdown/CMS 渲染。

## 何时使用
- 需要既能自定义又带默认美观样式的 React 组件 → shadcn/ui（代码落盘到仓库，完全可改）
- 需要自带可访问性（a11y）、外观完全自建的底层 UI 原语 → Headless UI
- 需要整站快速换肤、多主题切换、只用 class 不写 TS → daisyUI
- 渲染 Markdown/富文本/CMS 内容 → `@tailwindcss/typography`

## 基础用法

### shadcn/ui — CLI 初始化与加组件
```bash
pnpm dlx shadcn@latest init -t next      # 支持 next | vite | start | react-router | laravel | astro
pnpm dlx shadcn@latest add button card dialog
pnpm dlx shadcn@latest add button --dry-run   # 预览不落盘
```
`init` 会写入 `components.json`、装依赖、落 `cn` 工具、配置 CSS 变量。

### Headless UI（React v2.1）
无样式原语：Dialog / Popover / Listbox / Combobox / Menu / Tabs / Switch / Disclosure / Transition 等。与 Tailwind class 组合自己画样式，a11y 已内置。

### daisyUI — Tailwind v4 配置
```css
/* app.css */
@import "tailwindcss";
@plugin "daisyui" {
  themes: light --default, dark --prefersdark;
}
```
在任意 HTML 节点通过 `data-theme="cupcake"` 做分区换肤，可嵌套。`themes: all` 开启全部 35 套内置主题。

### @tailwindcss/typography
```css
/* Tailwind v4 */
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```
```html
<article class="prose lg:prose-xl dark:prose-invert">{{ markdown }}</article>
```
Tailwind v3 用 `tailwind.config.js` 的 `plugins: [require('@tailwindcss/typography')]`。

## 关键 API（摘要）

### shadcn CLI
- `init [-t template] [-b radix|base] [-p preset] [-d] [--css-variables] [--monorepo] [--rtl]`：初始化
- `add [component] [-y] [-o] [-a] [-p path] [--dry-run]`：按需加组件
- `apply --preset <id>`：套用 preset
- `view <items>`、`search @<registry> -q "<q>"`：预览/搜索 registry
- `build [--output <dir>]`：生成 registry JSON
- `migrate icons|radix|rtl`：迁移（`radix` 合并到统一 `radix-ui` 包；`rtl` 转逻辑属性）
- `docs <component>`、`info`：查文档/项目信息

### @tailwindcss/typography
- 灰阶修饰：`prose-gray|slate|zinc|neutral|stone`
- 尺寸修饰：`prose-sm|base|lg|xl|2xl`（可配断点：`md:prose-lg lg:prose-xl`）
- 元素修饰：`prose-headings:`, `prose-h1:` ... `prose-a:`, `prose-img:`, `prose-code:`, `prose-pre:`（v4 里 hover 放最后：`prose-a:hover:text-blue-500`；v3 相反）
- `dark:prose-invert`：暗色反转
- `max-w-none`：取消内建 max-width
- `not-prose`：子树退出 prose 样式
- 自定义类名：`@plugin "@tailwindcss/typography" { className: wysiwyg; }`
- 自定义配色：`@utility prose-pink { --tw-prose-body: ...; ... }`

### daisyUI 主题
- `@plugin "daisyui" { themes: light --default, dark --prefersdark; }`
- `data-theme="<name>"` 分区换肤，可嵌套
- `@plugin "daisyui/theme"` 建自定义主题，或同名重定义覆盖内置

## 注意事项

### shadcn/ui（Tailwind v4 + React 19 改造）
- 非破坏性升级，v3 + React 18 老项目继续可用
- CSS 变量：将 `:root`/`.dark` 移出 `@layer base`，色值包 `hsl()`，再用 `@theme inline` 暴露为 `--color-*`
- 图表 `chartConfig` 里移除 `hsl()` 包裹，改 `color: "var(--chart-1)"`
- 用 `size-4` 取代 `w-4 h-4`
- 依赖升级：`pnpm up "@radix-ui/*" cmdk lucide-react recharts tailwind-merge clsx --latest`
- 去掉 `React.forwardRef`，换成 `React.ComponentProps<...>` + `data-slot` 属性
- `toast` 组件已弃用，改用 `sonner`；`default` 样式弃用，新项目默认 `new-york`
- 颜色体系从 HSL 切到 OKLCH；2025-03-19 起 `tailwindcss-animate` 弃用，改 `tw-animate-css`

### @tailwindcss/typography
- `not-prose` 内不能再嵌一个新的 `prose` 实例
- 即使给工具类加 prefix，`not-prose` 本身也不加 prefix
- v4 里 `prose-a:hover:...` 元素修饰在前、状态修饰在后；v3 顺序相反
- 自定义 `css` 必须挂在 `DEFAULT` 或某个尺寸 modifier 下

### daisyUI
- 是 Tailwind 插件，依赖 Tailwind v4 的 `@plugin` 语法（v3 用 `plugins: [require('daisyui')]`）

## 组合提示
- shadcn/ui 内部用 Radix + Tailwind，天然兼容 Headless UI 风格的自建组件
- `@tailwindcss/typography` 常配合 MDX / Contentlayer / headless CMS
- daisyUI 与 shadcn/ui 通常二选一（主题体系冲突），daisyUI 更适合纯 HTML/多框架，shadcn/ui 更适合 React 深度定制
