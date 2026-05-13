---
name: app-shell-nav-frontend
description: 任何需要"应用整体外壳 + 侧边主导航"的场景必须用 `AppShellNav`,禁止自行 sidebar + drawer + 媒体查询 + 菜单状态拼。
---

# `@asn/app-shell-nav`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `AppShellNav`:

- 项目需要"持久的侧边主导航"(后台管理 / SaaS / 协作工具)
- 同一应用要兼顾桌面侧边栏 + 移动 hamburger,且想用同一份菜单数据
- 菜单是树状的(分组 + 嵌套),需要自动展开父节点
- 需要折叠状态持久化(用户刷新后保留)

## 何时**不**使用

- 顶部 H 型导航(返回 / 标题 / 右槽)→ `top-navbar`
- 移动端底部 tab 切换(2-5 个 tab,keep-alive)→ `mobile-tabbar`
- 命令面板 / Cmd-K 全局搜索 → `omnibox`(待建)
- 纯 Drawer 浮层(filter 面板 / 编辑抽屉)→ 直接用 antd `<Drawer>`
- 三栏 IDE 风(可拖拽列宽 / 侧栏可隐藏到边缘)→ 本块不适配

## 安装

```bash
pnpm add file:./sdk/ui-chrome/app-shell-nav/frontend
```

`main` / `types` 都指向 `src/index.ts`,无需构建。

## 最小用法

```tsx
import { AppShellNav } from '@asn/app-shell-nav';
import type { MenuItem } from '@asn/app-shell-nav';
import '@asn/app-shell-nav/styles.css';

<AppShellNav
  items={[
    { key: 'home', label: '首页', icon: <HomeOutlined />, route: '/' },
    { key: 'tasks', label: '任务', badge: 5, children: [...] },
  ]}
  activeKey={routeKey}
  onSelect={(item) => router.push(item.route!)}
  brand={<Logo />}
  footer={<UserCard />}
  persistKey="myapp.nav.collapsed"
>
  <PageContent />
</AppShellNav>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `items` | `MenuItem[]` | — | 菜单树 |
| `activeKey` | `string` | — | 当前激活 leaf key(host 从路由派生) |
| `onSelect` | `(item) => void` | — | leaf 点击回调(parent 不触发) |
| `brand` | `ReactNode` | — | sidebar 顶部 logo / 标题 |
| `footer` | `ReactNode` | — | sidebar 底部(用户卡片 / 退出按钮) |
| `children` | `ReactNode` | — | 主内容区(必填) |
| `breakpoint` | `number` | `768` | px,低于此值塌缩为 Drawer |
| `defaultCollapsed` | `boolean` | `false` | 桌面默认折叠态 |
| `persistKey` | `string` | — | localStorage key,持久化折叠态 |
| `collapsed` | `boolean` | — | 受控折叠态(覆盖持久化) |
| `onCollapsedChange` | `(c) => void` | — | 受控时配套 |
| `mobileDrawerOpen` | `boolean` | — | 受控 drawer 开关 |
| `onMobileDrawerOpenChange` | `(o) => void` | — | 受控时配套 |
| `width` | `number` | `240` | 展开宽 px |
| `collapsedWidth` | `number` | `64` | 折叠宽 px |
| `ariaLabel` | `string` | `'Main navigation'` | nav landmark |
| `className` | `string` | — | 根类 |

`MenuItem`:`{ key, label, icon?, route?, badge?, children?, disabled? }`

`badge`:`number`(数字角标)或 `'dot'`(小红点)。

## 内部已经处理好的事项

- ✅ `window.matchMedia` 监听 + cleanup(响应式 sidebar ↔ drawer 切换)
- ✅ 桌面折叠态 localStorage 读写(`persistKey` 触发)
- ✅ `activeKey` 改变时自动展开父节点链(`ancestorKeysOf` 树遍历)
- ✅ 移动端点击 leaf 后**自动关闭 Drawer**(否则用户得多按一次)
- ✅ leaf vs parent 区分:有 children 的节点点击只切展开,不触发 `onSelect`
- ✅ `<nav>` landmark + `aria-label` + `aria-expanded` + 键盘(antd Menu 自带)
- ✅ 折叠后 brand / footer 居中处理(`data-collapsed` 属性钩 CSS)

## 严格禁止的反模式

❌ **自己拼 sidebar + Drawer + media query**:本块就是为了消灭这种重复;每次手写都会漏响应式 / 持久化 / a11y

❌ **把激活态 / 折叠态全塞 host useState**:`activeKey` 由 host 给(单一事实源,通常派生自路由),但**折叠态默认走 persistKey 自管**;非要 host 控制时用 `collapsed` + `onCollapsedChange` 双向

❌ **MenuItem.route 当数据源**:`route` 只是数据备忘,不被组件消费;**激活靠 host 计算 activeKey**(避免组件耦合路由库)

❌ **嵌套 > 2 层**:antd Menu 支持深嵌套但 UX 烂;深层级请用 `tree-explorer`(待建)

❌ **在 onSelect 内自己关 mobile drawer**:本块在移动端 leaf 点击后已自动关 drawer,host 别重复

❌ **改 sdk 内的 AppShellNav.tsx**:菜单项渲染想定制 → 自己写 `renderItem` 风格的 prop 包装(目前未提供,可加 PR),或包 Adapter 而非 fork

## 状态

- v0.1 — 首版;后续可考虑:`renderItem` 完全自定义、双 sidebar(左主+右辅)、固定 sidebar 滚动跟随、键盘快捷键打开 drawer
