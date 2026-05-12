# top-navbar SDK

顶部导航条 UI chrome SDK——纯前端，无后端、无协议层。

```
component/
└── frontend/    NavBar / NavBarPage 组件 + SKILL.md
```

## 整体复制

```bash
cp -r blocks/top-navbar/component your-project/sdk/ui-chrome/top-navbar
```

## 用法

```tsx
import { ConfigProvider } from 'antd';
import { NavBar, NavBarPage } from '@ui/top-navbar';
import '@ui/top-navbar/styles.css';

// 仅顶部条
<NavBar title="消息" onBack={() => navigate(-1)} />

// 完整页面壳（顶部 + 内容区）
<NavBarPage title="消息" right={<Button>编辑</Button>}>
  <YourContent />
</NavBarPage>
```

`NavBar` 1:2:1 grid（左/标题/右槽）。`NavBarPage` 在 `NavBar` 外加一个
`flex-direction: column` 容器，content 区占满剩余空间。

## 关键设计

- **iOS safe-area**：标题区 padding-top 用 `env(safe-area-inset-top)` 适配
  刘海 / Dynamic Island
- **transparent mode**：`variant="transparent"` 时去掉背景，标题加 text-shadow，
  用于全屏背景图上的悬浮 navbar
- **不绑路由**：onBack 由 host 实现（不依赖 react-router 或 next/router）

## pkg / 端口

| 资源 | 值 |
|---|---|
| frontend pkg | `@ui/top-navbar` |
| 后端 | （无） |

## 何时**不**用

- 移动端 tab 切换 → `mobile-tabbar`
- 抽屉式侧边导航 → 用 antd `<Drawer>` 直接拼
- 完整桌面 admin 框架 → 用 antd `<Layout>` 直拼或 ProLayout
