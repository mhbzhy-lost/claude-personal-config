---
name: ant-pro-layout
description: "ProLayout 中后台整体布局框架，含侧边导航、顶部 Header、PageContainer 页面容器。Use when building React admin apps with @ant-design/pro-components and need a full-page admin layout."
component: ProLayout
package: "@ant-design/pro-components"
group: 高阶组件-布局
applies_to:
  markers_any:
    - "dependency: @ant-design/pro-components"
    - "dependency: antd"
tech_stack: [antd]
---

# ProLayout（中后台布局框架）

> 来源：https://procomponents.ant.design/components/layout

## 核心场景

ProLayout 是 `@ant-design/pro-components` 提供的中后台整体布局组件，解决以下问题：

- **一行代码搭出完整后台骨架**：侧边栏导航 + 顶部 Header + 面包屑 + 内容区，不必手动拼 antd Layout + Menu + Breadcrumb
- **路由驱动菜单**：传入路由配置自动生成多级菜单，支持图标、权限、隐藏等标记
- **三种布局模式**：侧边栏（side）、顶部导航（top）、混合模式（mix），通过 `layout` prop 一键切换
- **深度定制**：Header 右侧动作区、菜单底部、页脚、水印等均可通过 render props 替换
- **配合 PageContainer**：页面级容器提供标题、面包屑、Tab 切换、操作按钮等标准页头

**典型使用场景**：
1. 企业后台管理系统（RBAC、工单、CMS）
2. 数据看板 / BI 平台
3. SaaS 产品控制台
4. 开发者平台 / API 管理后台

## 安装

```bash
npm install @ant-design/pro-components antd
# 或
pnpm add @ant-design/pro-components antd
```

ProLayout 依赖 antd v5+、React 18+。

## 快速上手：完整布局示例

以下是一个带侧边导航、多页面路由、顶部用户信息的完整示例。使用 react-router-dom v6：

```tsx
// src/layouts/BasicLayout.tsx
import React, { useState } from 'react';
import { ProLayout, PageContainer } from '@ant-design/pro-components';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  UserOutlined,
  SettingOutlined,
  BellOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { Dropdown, Avatar, Badge, Space } from 'antd';
import type { MenuDataItem } from '@ant-design/pro-components';

// ---------- 路由菜单配置 ----------
const menuRoutes: MenuDataItem = {
  path: '/',
  children: [
    {
      path: '/dashboard',
      name: '仪表盘',
      icon: <DashboardOutlined />,
    },
    {
      path: '/user',
      name: '用户管理',
      icon: <UserOutlined />,
      children: [
        { path: '/user/list', name: '用户列表' },
        { path: '/user/roles', name: '角色管理' },
      ],
    },
    {
      path: '/settings',
      name: '系统设置',
      icon: <SettingOutlined />,
      children: [
        { path: '/settings/general', name: '基础配置' },
        { path: '/settings/security', name: '安全设置' },
      ],
    },
  ],
};

const BasicLayout: React.FC = () => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ProLayout
      title="Admin Console"
      logo="/logo.svg"
      layout="mix"
      fixedHeader
      fixSiderbar
      route={menuRoutes}
      location={location}
      collapsed={collapsed}
      onCollapse={setCollapsed}
      // ---------- 菜单项渲染（Link 跳转） ----------
      menuItemRender={(item, dom) => (
        <Link to={item.path ?? '/'}>{dom}</Link>
      )}
      // ---------- 顶部右侧操作区 ----------
      actionsRender={() => [
        <Badge key="bell" count={5} size="small">
          <BellOutlined style={{ fontSize: 16 }} />
        </Badge>,
      ]}
      // ---------- 头像区域 ----------
      avatarProps={{
        src: 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24IOql2/weixintupian_20170331104822.jpg',
        title: 'Admin User',
        size: 'small',
        render: (_props, dom) => (
          <Dropdown
            menu={{
              items: [
                { key: 'profile', icon: <UserOutlined />, label: '个人中心' },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' },
              ],
              onClick: ({ key }) => {
                if (key === 'logout') {
                  // handle logout
                }
              },
            }}
          >
            {dom}
          </Dropdown>
        ),
      }}
      // ---------- 菜单底部（可选） ----------
      menuFooterRender={(props) => {
        if (props?.collapsed) return undefined;
        return (
          <div style={{ textAlign: 'center', paddingBlockEnd: 12 }}>
            <div>Admin Console</div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>v1.0.0</div>
          </div>
        );
      }}
    >
      {/* 页面内容通过 react-router Outlet 渲染 */}
      <Outlet />
    </ProLayout>
  );
};

export default BasicLayout;
```

路由定义示例（react-router-dom v6）：

```tsx
// src/router.tsx
import { createBrowserRouter } from 'react-router-dom';
import BasicLayout from './layouts/BasicLayout';
import Dashboard from './pages/Dashboard';
import UserList from './pages/user/UserList';
import UserRoles from './pages/user/UserRoles';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <BasicLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'user/list', element: <UserList /> },
      { path: 'user/roles', element: <UserRoles /> },
      { path: 'settings/general', element: <div>General Settings</div> },
      { path: 'settings/security', element: <div>Security Settings</div> },
    ],
  },
]);
```

## PageContainer 页面容器

PageContainer 提供页面级标准页头，包含面包屑、标题、Tab 切换、操作按钮。放在 ProLayout 的 children 内使用。

### 基础用法

```tsx
// src/pages/user/UserList.tsx
import React from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Space } from 'antd';
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons';

const UserList: React.FC = () => {
  return (
    <PageContainer
      header={{
        title: '用户列表',
        subTitle: '管理系统用户和权限',
      }}
      extra={[
        <Button key="export" icon={<DownloadOutlined />}>
          导出
        </Button>,
        <Button key="create" type="primary" icon={<PlusOutlined />}>
          新建用户
        </Button>,
      ]}
    >
      {/* 页面主体内容，通常放 ProTable */}
      <div>用户列表内容区域</div>
    </PageContainer>
  );
};

export default UserList;
```

### 带 Tab 切换的页面

```tsx
import React, { useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';

const SettingsPage: React.FC = () => {
  const [activeKey, setActiveKey] = useState('basic');

  return (
    <PageContainer
      header={{ title: '系统设置' }}
      tabActiveKey={activeKey}
      onTabChange={setActiveKey}
      tabList={[
        { tab: '基础配置', key: 'basic' },
        { tab: '安全设置', key: 'security' },
        { tab: '通知配置', key: 'notification' },
      ]}
    >
      {activeKey === 'basic' && <div>基础配置内容</div>}
      {activeKey === 'security' && <div>安全设置内容</div>}
      {activeKey === 'notification' && <div>通知配置内容</div>}
    </PageContainer>
  );
};
```

### Ghost 模式（透明背景）

当页面内部已有 Card 等容器时，用 `ghost` 去掉 PageContainer 的白色背景，避免双层白底：

```tsx
<PageContainer ghost header={{ title: '仪表盘' }}>
  <Row gutter={[16, 16]}>
    <Col span={6}><Card>指标卡片</Card></Col>
    <Col span={6}><Card>指标卡片</Card></Col>
  </Row>
</PageContainer>
```

## 路由菜单配置

### MenuDataItem 结构

```ts
interface MenuDataItem {
  path?: string;           // 路由路径
  name?: string;           // 菜单显示名称
  icon?: React.ReactNode;  // 图标（antd Icon 组件或字符串）
  children?: MenuDataItem[]; // 子菜单
  hideInMenu?: boolean;    // 在菜单中隐藏（详情页等）
  hideChildrenInMenu?: boolean; // 隐藏子菜单
  flatMenu?: boolean;      // 子项提升到父级显示
  disabled?: boolean;      // 禁用
  // 扩展字段（自定义权限等）
  access?: string;         // 配合权限控制使用
  [key: string]: any;
}
```

### 多级菜单示例

```tsx
const route: MenuDataItem = {
  path: '/',
  children: [
    {
      path: '/dashboard',
      name: '仪表盘',
      icon: <DashboardOutlined />,
    },
    {
      path: '/content',
      name: '内容管理',
      icon: <FileTextOutlined />,
      children: [
        { path: '/content/articles', name: '文章管理' },
        { path: '/content/categories', name: '分类管理' },
        {
          path: '/content/articles/:id',
          name: '文章详情',
          hideInMenu: true,  // 详情页不在菜单中显示
        },
      ],
    },
    {
      path: '/audit',
      name: '审计日志',
      icon: <AuditOutlined />,
      // 无 children 即叶子节点
    },
  ],
};
```

### 图标用法

菜单 `icon` 接受两种形式：

```tsx
// 方式一：直接传 ReactNode（推荐，tree-shakeable）
{ icon: <DashboardOutlined /> }

// 方式二：传字符串名称（需全量引入 @ant-design/icons，不推荐）
{ icon: 'dashboard' }
```

## 常见定制模式

### 折叠侧边栏

```tsx
const [collapsed, setCollapsed] = useState(false);

<ProLayout
  collapsed={collapsed}
  onCollapse={setCollapsed}
  // 折叠宽度（默认 48）
  collapsedButtonRender={false}  // 隐藏默认折叠按钮，自行控制
/>
```

### 自定义 Header 右侧（用户头像、通知铃、全局搜索）

```tsx
<ProLayout
  actionsRender={(props) => {
    // props.isMobile 可判断移动端
    return [
      // 全局搜索
      <Input.Search
        key="search"
        placeholder="搜索"
        style={{ width: 200 }}
      />,
      // 通知铃
      <Badge key="bell" count={3} size="small">
        <BellOutlined style={{ fontSize: 16, cursor: 'pointer' }} />
      </Badge>,
      // 语言切换
      <Select
        key="lang"
        defaultValue="zh-CN"
        size="small"
        bordered={false}
        options={[
          { value: 'zh-CN', label: '中文' },
          { value: 'en-US', label: 'English' },
        ]}
      />,
    ];
  }}
  avatarProps={{
    src: user.avatar,
    title: user.name,
    size: 'small',
    render: (_props, dom) => (
      <Dropdown menu={{ items: userMenuItems }}>
        {dom}
      </Dropdown>
    ),
  }}
/>
```

### 固定 Header 和 Sider

```tsx
<ProLayout
  fixedHeader    // Header 吸顶
  fixSiderbar    // 侧边栏固定，内容区滚动
/>
```

### 三种布局模式

```tsx
// 侧边栏布局（默认）
<ProLayout layout="side" />

// 顶部导航布局
<ProLayout layout="top" />

// 混合布局：一级菜单在顶部，二级菜单在左侧
<ProLayout layout="mix" />
```

### 自定义 Footer

```tsx
import { DefaultFooter } from '@ant-design/pro-components';
import { GithubOutlined } from '@ant-design/icons';

<ProLayout
  footerRender={() => (
    <DefaultFooter
      copyright="2024 Your Company"
      links={[
        {
          key: 'github',
          title: <GithubOutlined />,
          href: 'https://github.com/your-org',
          blankTarget: true,
        },
        {
          key: 'docs',
          title: '文档',
          href: '/docs',
          blankTarget: true,
        },
      ]}
    />
  )}
/>
```

### 自定义菜单项渲染

在菜单项中加入 Badge、外链标记等：

```tsx
<ProLayout
  menuItemRender={(item, defaultDom) => {
    if (item.isExternal) {
      return (
        <a href={item.path} target="_blank" rel="noopener noreferrer">
          {defaultDom} <LinkOutlined />
        </a>
      );
    }
    return <Link to={item.path ?? '/'}>{defaultDom}</Link>;
  }}
  subMenuItemRender={(item, defaultDom) => (
    <span>{defaultDom}</span>
  )}
/>
```

### 水印

```tsx
<ProLayout
  waterMarkProps={{
    content: 'Admin User',
    fontColor: 'rgba(0,0,0,0.05)',
  }}
/>
```

## 关键 Props 速查

### ProLayout

| Prop | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `title` | `string` | `'Ant Design Pro'` | 左上角标题 |
| `logo` | `ReactNode \| () => ReactNode` | - | Logo 图片或组件 |
| `layout` | `'side' \| 'top' \| 'mix'` | `'side'` | 布局模式 |
| `route` | `MenuDataItem` | - | 路由/菜单配置（核心） |
| `location` | `Location` | - | 当前路由 location，用于菜单高亮 |
| `collapsed` | `boolean` | - | 侧边栏折叠状态（受控） |
| `onCollapse` | `(collapsed: boolean) => void` | - | 折叠回调 |
| `fixedHeader` | `boolean` | `false` | 固定 Header |
| `fixSiderbar` | `boolean` | `false` | 固定侧边栏 |
| `menuItemRender` | `(item, dom) => ReactNode` | - | 自定义菜单项（必传，用于路由跳转） |
| `actionsRender` | `(props) => ReactNode[]` | - | Header 右侧操作区 |
| `avatarProps` | `AvatarProps & { render }` | - | Header 右侧头像 |
| `footerRender` | `() => ReactNode` | - | 自定义页脚 |
| `headerRender` | `(props) => ReactNode` | - | 完全替换 Header |
| `menuFooterRender` | `(props) => ReactNode` | - | 菜单底部区域 |
| `waterMarkProps` | `WaterMarkProps` | - | 水印配置 |
| `token` | `LayoutToken` | - | 布局主题 token（颜色、间距等） |
| `siderWidth` | `number` | `208` | 侧边栏展开宽度 |

### PageContainer

| Prop | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `header` | `PageHeaderProps` | - | 页头配置（title, subTitle, breadcrumb 等） |
| `extra` | `ReactNode` | - | 页头右侧操作按钮 |
| `tabList` | `{tab, key}[]` | - | 页面级 Tab 列表 |
| `tabActiveKey` | `string` | - | 当前激活 Tab |
| `onTabChange` | `(key: string) => void` | - | Tab 切换回调 |
| `ghost` | `boolean` | `false` | 透明背景模式 |
| `content` | `ReactNode` | - | 标题下方的描述区域 |
| `loading` | `boolean` | `false` | 整体 loading 态 |
| `breadcrumbRender` | `(routers) => routers` | - | 自定义面包屑 |

## 注意事项

1. **menuItemRender 必须用 Link 包装**：ProLayout 默认渲染的菜单项不带路由跳转能力，必须通过 `menuItemRender` 用 react-router 的 `<Link>` 包装，否则点击菜单不会切换页面。

2. **location 必须传入**：不传 `location` 会导致菜单高亮和面包屑失效。使用 `useLocation()` 获取并传入。

3. **route 与 react-router 路由是两套配置**：`route` prop 只控制菜单渲染，不控制实际路由。你需要在 react-router 中单独定义路由。两者的 `path` 需保持一致。

4. **layout="mix" 的行为**：混合模式下一级菜单在顶部，选中后对应的二级菜单出现在左侧。适合菜单项较多的场景。

5. **icon 字符串形式已不推荐**：ProLayout v2+ 中 icon 字符串需要额外配置 IconMap，建议直接传入 React 组件形式的 icon。

6. **PageContainer 默认有白色背景**：如果页面内容本身有 Card，会形成双层白底。此时加 `ghost` prop 去掉容器背景。

7. **Token 主题定制**：ProLayout 支持通过 `token` prop 做细粒度样式定制（侧边栏背景色、菜单选中色等），比 CSS 覆写更稳定：

```tsx
<ProLayout
  token={{
    sider: {
      colorMenuBackground: '#001529',
      colorTextMenu: 'rgba(255,255,255,0.75)',
      colorTextMenuSelected: '#fff',
      colorBgMenuItemSelected: '#1677ff',
    },
    header: {
      colorBgHeader: '#fff',
    },
  }}
/>
```

8. **移动端适配**：ProLayout 内置移动端响应式，窄屏下侧边栏自动变为 Drawer。可通过 `breakpoint` prop 调整断点。

## 与 ProTable / ProForm 配合

ProLayout + PageContainer 是 ProTable 页面的标准外壳：

```tsx
// src/pages/user/UserList.tsx
import React from 'react';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface UserRecord {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'disabled';
  createdAt: string;
}

const columns: ProColumns<UserRecord>[] = [
  { title: '用户名', dataIndex: 'name', copyable: true },
  { title: '邮箱', dataIndex: 'email' },
  {
    title: '状态',
    dataIndex: 'status',
    valueEnum: {
      active: { text: '正常', status: 'Success' },
      disabled: { text: '禁用', status: 'Error' },
    },
  },
  { title: '创建时间', dataIndex: 'createdAt', valueType: 'dateTime' },
  {
    title: '操作',
    valueType: 'option',
    render: (_, record) => [
      <a key="edit">编辑</a>,
      <a key="delete" style={{ color: 'red' }}>删除</a>,
    ],
  },
];

const UserList: React.FC = () => {
  return (
    <PageContainer ghost>
      <ProTable<UserRecord>
        headerTitle="用户列表"
        rowKey="id"
        columns={columns}
        request={async (params) => {
          // 替换为你的 API 调用
          const res = await fetch(`/api/users?${new URLSearchParams(params as any)}`);
          const data = await res.json();
          return { data: data.list, total: data.total, success: true };
        }}
        toolBarRender={() => [
          <Button key="create" type="primary" icon={<PlusOutlined />}>
            新建用户
          </Button>,
        ]}
        pagination={{ defaultPageSize: 10 }}
      />
    </PageContainer>
  );
};

export default UserList;
```

同样，ProForm 表单页面：

```tsx
import { PageContainer, ProForm, ProFormText, ProFormSelect } from '@ant-design/pro-components';
import { message } from 'antd';

const UserCreate: React.FC = () => {
  return (
    <PageContainer header={{ title: '新建用户' }}>
      <ProForm
        onFinish={async (values) => {
          await fetch('/api/users', {
            method: 'POST',
            body: JSON.stringify(values),
          });
          message.success('创建成功');
        }}
      >
        <ProFormText name="name" label="用户名" rules={[{ required: true }]} />
        <ProFormText name="email" label="邮箱" rules={[{ required: true, type: 'email' }]} />
        <ProFormSelect
          name="role"
          label="角色"
          options={[
            { label: '管理员', value: 'admin' },
            { label: '普通用户', value: 'user' },
          ]}
        />
      </ProForm>
    </PageContainer>
  );
};
```

## 组合提示

- **ProTable**：CRUD 列表页的标准搭配，PageContainer 做页头 + ProTable 做数据表格
- **ProForm / ModalForm / DrawerForm**：表单页 / 弹窗表单
- **ProCard**：仪表盘场景，PageContainer(ghost) + ProCard 网格
- **antd Menu / Breadcrumb**：ProLayout 内部已使用，一般不需额外引入
- **react-router-dom v6**：ProLayout 配合 Outlet 做嵌套路由渲染
- **@ant-design/pro-components 其他组件**：ProDescriptions（详情页）、StatisticCard（指标卡）
