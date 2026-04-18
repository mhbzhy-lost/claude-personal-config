---
name: tailwindcss-dark-mode
description: 使用 Tailwind CSS 的 dark variant 为站点提供暗色主题，支持系统偏好、手动 class/data 属性切换三种模式
tech_stack: [tailwindcss]
language: [html, css, javascript]
capability: [theming]
version: "tailwindcss unversioned"
collected_at: 2026-04-18
---

# Tailwind CSS Dark Mode（暗色模式）

> 来源：https://tailwindcss.com/docs/dark-mode

## 用途
通过内置的 `dark:` variant，为任意工具类提供暗色主题变体；默认跟随系统 `prefers-color-scheme`，也可改为由 class / data 属性手动驱动。

## 何时使用
- 站点需要与操作系统深色模式联动
- 需要用户手动切换亮/暗主题（toggle 按钮）
- 需要支持"亮 / 暗 / 跟随系统"三态主题切换
- 需要在 SSR 场景将主题偏好持久化（cookie / DB）并在服务端渲染 class

## 基础用法
默认跟随系统偏好，任意工具类前加 `dark:` 前缀即可：

```html
<div class="bg-white dark:bg-gray-800 rounded-lg px-6 py-8">
  <h3 class="text-gray-900 dark:text-white">标题</h3>
  <p class="text-gray-500 dark:text-gray-400">正文</p>
</div>
```

## 关键 API（摘要）

### 1. 手动 class 驱动（最常用）
在 CSS 入口覆盖 `dark` variant：

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
```

任何祖先元素带 `.dark` class 时激活：

```html
<html class="dark">
  <body><div class="bg-white dark:bg-black">...</div></body>
</html>
```

### 2. 基于 data 属性驱动
适合已有主题体系用 `data-theme` 的项目：

```css
@import "tailwindcss";
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```

```html
<html data-theme="dark"><body>...</body></html>
```

### 3. 三态切换（亮 / 暗 / 跟随系统）
配合 `localStorage` + `matchMedia` 在页面加载时决定 class：

```javascript
// 页面加载时（建议内联到 <head>，避免 FOUC）
document.documentElement.classList.toggle(
  "dark",
  localStorage.theme === "dark" ||
    (!("theme" in localStorage) &&
      window.matchMedia("(prefers-color-scheme: dark)").matches),
);

// 用户显式选择
localStorage.theme = "light";    // 强制亮
localStorage.theme = "dark";     // 强制暗
localStorage.removeItem("theme"); // 跟随系统
```

## 注意事项
- **FOUC 防护**：主题判定脚本必须**内联在 `<head>` 顶部同步执行**，否则会先渲染默认主题再闪烁切换到深色
- `@custom-variant dark` 覆盖会**关闭** `prefers-color-scheme` 的自动响应，需自行用 `matchMedia` 同步系统变化
- `&:where(.dark, .dark *)` 的 `:where()` 将选择器优先级降为 0，避免与业务样式相互覆盖
- 主题偏好也可放服务端（DB / cookie），由 SSR 直接在 `<html>` 输出 class，从根本消除 FOUC

## 组合提示
- 与 `@theme` / CSS 变量配合，可让同一组语义色 token 在亮暗模式下自动切换
- 与 `prose` 插件搭配时使用 `dark:prose-invert` 处理富文本内容
- 三态切换场景常配合 `window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", ...)` 监听系统变化
