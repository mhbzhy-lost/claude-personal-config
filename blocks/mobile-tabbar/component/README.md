# mobile-tabbar SDK

移动端底部 tabbar shell SDK——纯前端，2-5 个 tab，keep-alive 切换。

```
component/
└── frontend/    TabbarShell 组件 + SKILL.md
```

## 整体复制

```bash
cp -r blocks/mobile-tabbar/component your-project/sdk/ui-chrome/mobile-tabbar
```

## 用法

```tsx
import { ConfigProvider } from 'antd';
import { TabbarShell } from '@ui/mobile-tabbar';
import '@ui/mobile-tabbar/styles.css';

<ConfigProvider>
  <TabbarShell
    tabs={[
      { key: 'feed', label: '动态', icon: <HomeOutlined />, content: <FeedPage /> },
      { key: 'msg', label: '消息', icon: <MessageOutlined />, content: <MessagesPage />, badge: 5 },
      { key: 'mine', label: '我的', icon: <UserOutlined />, content: <MinePage /> },
    ]}
    defaultActive="feed"
  />
</ConfigProvider>
```

## 关键设计

- **keep-alive**：每个 tab 首次激活后就保留在 DOM（`display:none` 切换），保留滚动
  位置 + 组件内部状态——避免来回切换重渲染
- **badge 两形态**：`badge: number`（数字角标，>99 显示 99+）或 `badge: true`（小红点）
- **2-5 个 tab**：超出业务规范，强制约束
- **a11y**：role="tablist" / "tab" / "tabpanel"，aria-selected 跟随
- **iOS safe-area**：底部 padding-bottom 用 `env(safe-area-inset-bottom)` 避开 Home Indicator

## pkg / 端口

| 资源 | 值 |
|---|---|
| frontend pkg | `@ui/mobile-tabbar` |
| 后端 | （无） |

## 何时**不**用

- 顶部返回 / 标题条 → `top-navbar`
- ≥6 个 tab（业务超载）→ 拆 sub-tabbar 或抽屉
- 桌面 admin 侧边导航 → 用 antd `<Layout.Sider>` + `<Menu>`
- 路由级 tab（每个 tab 是独立路由）→ 用 react-router `<Outlet>` 自己拼
