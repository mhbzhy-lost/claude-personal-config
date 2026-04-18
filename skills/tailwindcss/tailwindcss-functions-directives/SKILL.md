---
name: tailwindcss-functions-directives
description: Tailwind CSS v4 在 CSS 中提供的自定义 at-rules（@theme/@utility/@apply/@reference 等）与内置函数（--alpha()/--spacing()）参考
tech_stack: [tailwindcss]
version: "tailwindcss v4 unversioned"
collected_at: 2026-04-18
capability: [theming]
---

# Tailwind CSS Functions & Directives（函数与指令）

> 来源：https://tailwindcss.com/docs/functions-and-directives

## 用途
Tailwind v4 把配置、主题、自定义工具类等能力从 JS config 迁移到 CSS 原生 at-rules 与函数，本 skill 汇总这些 CSS 端 API 的用法与迁移要点。

## 何时使用
- 在项目入口 CSS 中引入 Tailwind、定义设计令牌（颜色/间距/字体/断点）
- 写自定义工具类、自定义 variant、或在 CSS 中复用已有工具类
- 在 Vue / Svelte `<style>` 块或 CSS Modules 中使用 `@apply` / `@variant`
- 从 v3 JS 配置渐进迁移到 v4 CSS-first 配置

## 基础用法

```css
/* app.css —— v4 项目入口 */
@import "tailwindcss";

@theme {
  --font-display: "Satoshi", sans-serif;
  --breakpoint-3xl: 120rem;
  --color-avocado-500: oklch(0.84 0.18 117.33);
  --ease-snappy: cubic-bezier(0.2, 0, 0, 1);
}

@utility tab-4 {
  tab-size: 4;
}

@custom-variant theme-midnight (&:where([data-theme="midnight"] *));

.select2-dropdown {
  @apply rounded-b-lg shadow-md;
}
```

## 关键 API（摘要）

### 指令（directives）
- `@import "tailwindcss"`：内联引入 Tailwind 自身或其他 CSS
- `@theme { --* }`：定义设计令牌（字体、颜色、断点、缓动等），以 CSS 变量形式书写
- `@source "path"`：显式声明自动内容扫描未覆盖的源文件（如 node_modules 下的 UI 库）
- `@utility name { ... }`：注册自定义工具类，自动支持 `hover:` / `focus:` / `lg:` 等 variant
- `@variant name { ... }`：在 CSS 内对某段样式应用 Tailwind variant，如 `@variant dark { ... }`
- `@custom-variant name (selector)`：声明新的自定义 variant
- `@apply <utility-classes>`：将工具类内联进自定义 CSS 选择器
- `@reference "path"`：仅在 Vue/Svelte/CSS Modules 等隔离作用域的 `<style>` 中，**只引用**主样式表以让 `@apply`/`@variant` 可用，不会重复输出 CSS

### 函数（functions）
- `--alpha(<color> / <percent>)`：调整颜色透明度，编译为 `color-mix(in oklab, <color> N%, transparent)`
- `--spacing(<n>)`：按 theme spacing 刻度生成值，编译为 `calc(var(--spacing) * n)`，可在 arbitrary values + `calc()` 中使用

### v3 兼容（仅为迁移保留）
- `@config "../tailwind.config.js"`：加载旧 JS 配置
- `@plugin "<pkg-or-path>"`：加载旧 JS 插件
- `theme(spacing.12)`：点分路径访问 theme 值（已 deprecated，推荐改用 CSS 变量）

## 注意事项

- **`@reference` 必须用于隔离作用域**：Vue/Svelte `<style>` 或 CSS Modules 中直接 `@apply` 会因找不到 theme 变量而失败，必须先 `@reference "../app.css"`；如无自定义可直接 `@reference "tailwindcss"`
- **Subpath imports**：`@import` / `@reference` / `@plugin` / `@config` 在 CLI、Vite、PostCSS 下都支持 `package.json#imports` 路径别名（如 `"#app.css"`）
- **CSS 优先级**：`@config` / `@plugin` 可与 `@theme` / `@utility` 共存，用于渐进迁移；**CSS 中定义的内容会合并或覆盖** JS 配置、presets、plugins
- **v4 不再支持**的 JS 配置项：`corePlugins`、`safelist`、`separator`。v4 中要 safelist 请用 `@source inline(...)`
- **`theme()` 已 deprecated**：新代码请直接使用 `@theme` 定义的 CSS 变量（`var(--color-avocado-500)`）
- **`@utility` vs 普通 class**：只有用 `@utility` 注册的才能自动获得 variant 前缀支持，普通 `.class { @apply ... }` 不行

## 组合提示

- 与 Vue/Svelte SFC 结合时，`@reference` + `@apply` 是标准组合
- `--spacing()` 常与 arbitrary values 搭配：`class="py-[calc(--spacing(4)-1px)]"`
- 从 v3 迁移项目时，先 `@config` 挂原配置，再逐步把 theme/utilities/variants 搬入 CSS
