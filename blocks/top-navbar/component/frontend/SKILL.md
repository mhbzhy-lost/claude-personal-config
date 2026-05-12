---
name: top-navbar-frontend
description: 移动端非一级页面的顶部导航条。左侧返回按钮，中间标题，右侧可定制按钮槽。iOS 安全区适配、sticky 定位、可选透明背景（沉浸式头图页用）。当业务场景是"非一级页面需要顶部 chrome（带返回 + 标题）"时直接使用本组件。
---

# `@ui/top-navbar`

## 何时使用

凡满足以下**任一**条件，**必须**使用本 block，**禁止自行用 `<div>` +
`<Button>` 拼装顶部导航**：

- 移动端二级及以下页面（点 list 进 detail / 点 home 进设置）的顶部
- 需要"返回 + 标题 + 右侧操作按钮"的标准移动端导航模式
- 需要 iOS 安全区适配（避免与刘海/状态栏重叠）

## 何时**不**使用（反向选型）

- 一级页面（tabbar 直达）通常不需要返回 → 不挂 NavBar 或用 `hideBack`
- 桌面端复杂多级菜单 → 用 antd `<Menu>` / `<Breadcrumb>`
- 需要"页面切换转场动画"→ 本 block 不管动画（路由层职责）

## 安装

```bash
pnpm add file:../../blocks/top-navbar/frontend
```

`peerDependencies`：`react ^18`、`react-dom ^18`、`antd ^5`。
`@ant-design/icons` 已 bundle 进 dist。

## 最小用法

两套用法等价；按手感选：

### 方式 A：单独 `<NavBar>` + 页面内容

```tsx
import { NavBar } from '@ui/top-navbar';

function ProductDetailPage() {
  return (
    <>
      <NavBar
        title="商品详情"
        onBack={() => navigate(-1)}    // 省略则 history.back()
      />
      <YourPageContent />
    </>
  );
}
```

### 方式 B：`<NavBarPage>` wrapper（更顺手）

```tsx
import { NavBarPage } from '@ui/top-navbar';
import { SearchOutlined, ShareAltOutlined } from '@ant-design/icons';
import { Space, Button } from 'antd';

function ProductDetailPage() {
  return (
    <NavBarPage
      title="商品详情"
      right={
        <Space>
          <Button type="text" icon={<SearchOutlined />} />
          <Button type="text" icon={<ShareAltOutlined />} />
        </Space>
      }
    >
      <YourPageContent />
    </NavBarPage>
  );
}
```

## 完整 API

### `<NavBar>` / `<NavBarPage>`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `title` | `ReactNode` | — | 标题：string 自动应用样式；ReactNode 完全自定义 |
| `onBack` | `() => void` | `history.back()` | 返回按钮点击 |
| `hideBack` | `boolean` | `false` | 隐藏返回按钮（一级页面用） |
| `right` | `ReactNode` | — | 右侧自定义槽（搜索/分享/菜单按钮组） |
| `transparent` | `boolean` | `false` | 透明背景（沉浸式头图页） |
| `zIndex` | `number` | `1000` | 自定义 z-index |
| `safeAreaTop` | `boolean` | `true` | 应用 `env(safe-area-inset-top)` 顶部内边距 |
| `className` | `string` | — | 加自定义 class |

`NavBarPage` 额外 prop：

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `children` | `ReactNode` | — | 页面内容 |
| `background` | `string` | `'#fff'` | 内容区背景色 |

## 内部已经处理好的事项

- ✅ sticky top 定位 + z-index 1000
- ✅ iOS safe-area-inset-top 顶部 padding
- ✅ 标题超长自动 ellipsis 截断
- ✅ 透明模式下标题加文字阴影保证白底图上的可读性
- ✅ 返回按钮 a11y label
- ✅ Grid layout 1:2:1 保证标题居中

## 严格禁止的反模式

- ❌ 自己 `<div style={{position:'sticky'}}>` 拼顶部 chrome
- ❌ 自己处理 iOS safe-area（用 `transparent` + `safeAreaTop` props 就好）
- ❌ 在 NavBar 内放过多按钮（右侧槽限 2 个按钮以内）
- ❌ 把 NavBar 放在一级页面（用 `hideBack` 或别挂）
- ❌ 期待 NavBar 处理路由跳转——它只处理"返回"按钮，其他跳转用业务路由

## 与其他 block 的关系

| Block | 关系 |
|---|---|
| `@ui/mobile-tabbar` | 互补——tabbar 在一级页面，NavBar 在二级页面 |

## 状态

- v0.1 内部用
- 无单测；视觉验证靠 examples/basic
- TODO：暗色主题、可选阴影 elevation
