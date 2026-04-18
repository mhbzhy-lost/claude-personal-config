---
name: tailwindcss-variants
description: Tailwind CSS variant 修饰符体系——通过类名前缀条件式应用工具类，覆盖伪类、伪元素、媒体查询、属性选择器和子选择器
tech_stack: [tailwindcss]
version: "tailwindcss unversioned"
collected_at: 2026-04-18
capability: [theming]
---

# Tailwind CSS Variants（变体修饰符）

> 来源：https://tailwindcss.com/docs/hover-focus-and-other-states

## 用途
通过在工具类前添加 variant 前缀（如 `hover:`、`md:`、`dark:`、`aria-checked:`），让该工具类**仅在特定条件下生效**。不改写现有类，而是叠加一个"条件专用类"。Variants 可任意堆叠：`dark:md:hover:bg-fuchsia-600`。

## 何时使用
- 交互状态：hover、focus、active、visited、focus-visible、focus-within
- 结构位置：first、last、odd、even、nth-*、only
- 表单状态：required、invalid、disabled、checked、placeholder-shown
- 响应式/环境：md、lg、dark、motion-reduce、contrast-more、print、portrait
- 属性驱动：aria-*、data-*、open、inert、rtl/ltr
- 关联选择：group-*（父状态）、peer-*（兄弟状态）、has-*、in-*、not-*
- 伪元素：before、after、placeholder、file、marker、selection、first-line、first-letter、backdrop
- 子元素：`*:`（直接子）、`**:`（所有后代）

## 基础用法

```html
<!-- 交互 + 响应式 + 暗色 堆叠 -->
<button class="bg-violet-500 hover:bg-violet-600 active:bg-violet-700
               focus:outline-2 focus:outline-violet-500
               dark:md:hover:bg-fuchsia-600">
  Save
</button>
```

## 关键 variant（摘要）

### 伪类
- `hover:` `focus:` `active:` `focus-visible:` `focus-within:` `visited:`
- `first:` `last:` `odd:` `even:` `nth-3:` `nth-last-5:` `nth-of-type-4:`
- `required:` `invalid:` `disabled:` `checked:` `read-only:`
- `has-[...]:` 基于后代状态/内容，如 `has-checked:`、`has-[img]:`、`has-[:focus]:`
- `not-<variant>:` 取反，如 `not-focus:`、`not-supports-[...]:`

### 关联选择（极高频）
- `group` + `group-hover:` / `group-focus:` / `group-aria-*` / `group-has-*`：父触发
- `peer` + `peer-invalid:` / `peer-checked:` / `peer-focus:`：**前置**兄弟触发
- 命名组/peer：`group/item` + `group-hover/item:`、`peer/draft` + `peer-checked/draft:` 用于区分嵌套
- 任意选择器：`group-[.is-published]:block`、`peer-[:nth-of-type(3)_&]:block`
- `in-*`：无需标记 `group`，响应**任何**祖先状态，如 `in-focus:opacity-100`

### 伪元素
- `before:` `after:`（自动注入 `content: ''`）
- `placeholder:` `file:` `marker:`（可继承）`selection:`（可继承）
- `first-line:` `first-letter:` `backdrop:`

### 媒体/特性查询
- 响应式：`sm:` `md:` `lg:` `xl:` `2xl:`（视口） / `@md:` `@lg:`（容器查询，需 `@container`）
- `dark:` `motion-reduce:` `motion-safe:` `contrast-more:` `contrast-less:`
- `forced-colors:` `inverted-colors:` `pointer-fine:` `pointer-coarse:` `any-pointer-*`
- `portrait:` `landscape:` `print:` `noscript:`
- `supports-[display:grid]:` `supports-backdrop-filter:` `not-supports-[...]:`
- `starting:` 对应 `@starting-style`（首次渲染 / display:none→可见 的起始样式）

### 属性选择器
- `aria-checked:` `aria-disabled:` `aria-expanded:` `aria-selected:` 等布尔 ARIA 内置；自定义值用 `aria-[sort=ascending]:`
- `data-active:`（存在即匹配）、`data-[size=large]:`（值匹配）
- `rtl:` `ltr:` `open:`（details/dialog/popover）`inert:`

### 子选择器
- `*:rounded-full`：直接子元素
- `**:data-avatar:size-12`：所有后代（常配合属性 variant 收敛范围）

### 任意/自定义 variant
- 任意：`[&.is-dragging]:cursor-grabbing`、`[&_p]:mt-4`（`_` 代表空格）、`[@supports(display:grid)]:grid`
- 注册：在 CSS 里用 `@custom-variant theme-midnight (&:where([data-theme="midnight"] *));`

## 注意事项

- **`peer` 只能标注前置兄弟**：CSS 后续兄弟组合器 `~` 无法向前选择。把 `peer` 放在 label 之后的 input 上，label 的 `peer-*:` 不会生效。
- **`*:` 变体无法被子元素自身工具类覆盖**：两者同优先级、子规则生成更晚——子上直接写 `bg-red-50` 不会赢。需要差异化时把样式直接放到子元素、或使用 `**:` + 属性选择器收敛。
- **`before:` / `after:` 内容不进入 DOM，无法被用户选中/复制**：仅适用于装饰性内容。
- **`in-*` 响应任意祖先**：粒度过粗，需要特定父级时仍用 `group`。
- **`marker:` 与 `selection:` 可继承**：在祖先上声明一次即可，避免逐 `<li>` 重复。
- **命名 group/peer 不需预配置**：`group/foo`、`peer/bar` 可在标签里直接起名，Tailwind 自动生成对应 CSS。
- **任意值带空格**：用下划线替代，如 `[&_p]`；at-rule 变体（`[@media...]`、`[@supports...]`）不需要 `&` 占位。

## 组合提示

- 暗色 + 响应式 + 交互：`dark:md:hover:...` 顺序可任意，但建议统一风格
- 表单浮动 label：`peer` + `peer-placeholder-shown:` / `peer-focus:`
- 下拉图标旋转：父用 `group`，子用 `group-aria-[expanded=true]:rotate-180`
- 主题切换：`@custom-variant` + `data-theme` 属性配合 `theme-*:` 自定义 variant
- 容器查询驱动的组件级响应式：父 `@container` + 子 `@md:flex-row`，优于视口断点用于可复用组件
