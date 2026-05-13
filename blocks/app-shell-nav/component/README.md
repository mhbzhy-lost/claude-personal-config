# app-shell-nav SDK

应用壳 + 响应式侧边导航 UI chrome SDK。纯前端、无后端。

- 桌面端:固定左侧 sidebar,可折叠到 icon-only(状态 localStorage 持久化)
- 移动端(< breakpoint):塌缩为 hamburger 按钮 + Drawer
- 菜单 schema 化:`MenuItem[]` 含 icon / label / route / badge / children / disabled
- 当前路由 → activeKey,组件自动展开父节点 + 高亮
- a11y:`<nav>` landmark、`aria-expanded`、键盘 + ESC 关闭 drawer

```
component/
└── frontend/    AppShellNav 组件 + 两个 hook + SKILL.md
```

## 整体复制

```bash
cp -r blocks/app-shell-nav/component your-project/sdk/ui-chrome/app-shell-nav
```

## 最小用法

```tsx
import { AppShellNav } from '@asn/app-shell-nav';
import type { MenuItem } from '@asn/app-shell-nav';
import { HomeOutlined, SettingOutlined, MailOutlined } from '@ant-design/icons';
import '@asn/app-shell-nav/styles.css';

const items: MenuItem[] = [
  { key: 'home', label: '首页', icon: <HomeOutlined />, route: '/' },
  {
    key: 'mail',
    label: '消息',
    icon: <MailOutlined />,
    badge: 3,
    children: [
      { key: 'inbox', label: '收件箱', route: '/mail/inbox' },
      { key: 'sent', label: '已发送', route: '/mail/sent' },
    ],
  },
  { key: 'settings', label: '设置', icon: <SettingOutlined />, route: '/settings' },
];

<AppShellNav
  items={items}
  activeKey={currentRouteKey}
  onSelect={(item) => router.push(item.route!)}
  brand={<span>MyApp</span>}
  footer={<UserCard />}
  persistKey="myapp.nav.collapsed"
>
  <YourPageContent />
</AppShellNav>
```

## 关键设计

- **响应式**:`breakpoint`(默认 768)以下用 Drawer;以上用固定 sidebar
- **激活态自动展开**:`activeKey` 改变时,自动展开包含它的父节点链
- **折叠 + 持久化**:折叠状态默认走 localStorage(`persistKey`),也可受控
- **零路由耦合**:不依赖任何路由库;`MenuItem.route` 仅是数据备忘,激活由 host 算
- **leaf 才触发 onSelect**:有 children 的节点点击是展开/收起,不触发选择
- **键盘 / a11y**:Tab 切换、Enter/Space 选中、Esc 关 drawer、navigation landmark

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@asn/app-shell-nav` |
| 后端 | (无) |
| 协议 | (无) |

## 何时**不**用

- 顶部导航条 → `top-navbar`
- 移动端 tab(底部 2-5 个 tab) → `mobile-tabbar`
- 命令面板 / Cmd-K → `omnibox`(待建)
- 纯 Drawer 浮层(非主导航) → 直接用 antd `<Drawer>`
- 三栏 IDE(可拖拽列宽) → 不适配

## 完整 Props 见 SKILL.md
