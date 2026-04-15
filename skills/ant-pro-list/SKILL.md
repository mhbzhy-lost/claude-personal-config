---
name: ant-pro-list
description: "ProList 高级列表，支持卡片/列表视图切换、内置搜索、分页、操作按钮。Use when building React admin apps with @ant-design/pro-components and need a list page with search, pagination, and item actions."
component: ProList
package: "@ant-design/pro-components"
group: 高阶组件-数据展示
applies_to:
  markers_any:
    - "dependency: @ant-design/pro-components"
    - "dependency: antd"
---

# ProList（高级列表）

> 来源：https://procomponents.ant.design/components/list

## 核心场景

ProList 是 antd List 的高阶封装，底层基于 ProTable 实现。适用于：

- **内容列表页**：文章列表、任务列表、通知列表等，需要 title/description/avatar 的标准布局
- **卡片列表页**：应用市场、产品展示等网格布局，通过 `grid` 一键切换
- **带操作的列表**：每行带编辑/删除/更多操作按钮
- **带搜索和筛选的列表**：内置 search 配置，无需手写搜索表单
- **需要远程数据加载的列表**：通过 `request` 属性直接对接后端 API，自动处理 loading/分页

与 ProTable 共享大部分 API（columns、request、pagination、toolBarRender 等），但以 `metas` 替代 `columns` 来定义列表项的各个区域。

## 安装

```bash
npm install @ant-design/pro-components
# 或
pnpm add @ant-design/pro-components
```

ProList 从 `@ant-design/pro-components` 统一导出：

```tsx
import { ProList } from '@ant-design/pro-components';
```

## 基础用法：内容列表

使用 `dataSource` 直接传入数据，通过 `metas` 定义列表项各区域的数据映射：

```tsx
import React from 'react';
import { ProList } from '@ant-design/pro-components';
import { Tag, Space } from 'antd';

interface ArticleItem {
  id: string;
  title: string;
  description: string;
  avatar: string;
  status: 'draft' | 'published' | 'archived';
  updatedAt: string;
}

const mockData: ArticleItem[] = [
  {
    id: '1',
    title: 'Ant Design 5.0 发布',
    description: '全新的设计语言和组件库，带来更好的开发体验。',
    avatar: 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24IOql2/weixintupian_20170331104822.jpg',
    status: 'published',
    updatedAt: '2024-01-15',
  },
  {
    id: '2',
    title: 'ProComponents 2.0 升级指南',
    description: '详细介绍从 1.x 到 2.x 的迁移步骤和破坏性变更。',
    avatar: 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24IOql2/weixintupian_20170331104822.jpg',
    status: 'draft',
    updatedAt: '2024-02-20',
  },
  {
    id: '3',
    title: '使用 ProList 构建管理后台列表页',
    description: '从零开始搭建一个完整的列表页，包括搜索、分页和操作。',
    avatar: 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24IOql2/weixintupian_20170331104822.jpg',
    status: 'published',
    updatedAt: '2024-03-10',
  },
];

const statusColorMap: Record<string, string> = {
  draft: 'default',
  published: 'success',
  archived: 'warning',
};

const ArticleList: React.FC = () => {
  return (
    <ProList<ArticleItem>
      toolBarRender={() => [
        <Button key="add" type="primary">
          新建文章
        </Button>,
      ]}
      headerTitle="文章列表"
      dataSource={mockData}
      metas={{
        title: {
          dataIndex: 'title',
        },
        description: {
          dataIndex: 'description',
        },
        avatar: {
          dataIndex: 'avatar',
        },
        subTitle: {
          render: (_, row) => (
            <Space>
              <Tag color={statusColorMap[row.status]}>{row.status}</Tag>
              <span>更新于 {row.updatedAt}</span>
            </Space>
          ),
        },
      }}
      rowKey="id"
    />
  );
};

export default ArticleList;
```

## 远程数据加载（request 模式）

`request` 是 ProList 最强大的特性之一——自动处理 loading 状态、分页参数拼接和数据回填：

```tsx
import React from 'react';
import { ProList } from '@ant-design/pro-components';
import { Button, message, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface TaskItem {
  id: number;
  title: string;
  owner: string;
  avatar: string;
  status: 'todo' | 'doing' | 'done';
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
}

const priorityMap: Record<string, { text: string; color: string }> = {
  high: { text: '高', color: 'red' },
  medium: { text: '中', color: 'orange' },
  low: { text: '低', color: 'blue' },
};

const TaskList: React.FC = () => {
  return (
    <ProList<TaskItem>
      headerTitle="任务管理"
      toolBarRender={() => [
        <Button key="add" type="primary" icon={<PlusOutlined />}>
          新建任务
        </Button>,
      ]}
      // request 返回 Promise，必须符合 { data, success, total } 格式
      request={async (params) => {
        // params 自动包含 current（页码）和 pageSize
        const { current = 1, pageSize = 10, ...filters } = params;
        const response = await fetch(
          `/api/tasks?page=${current}&size=${pageSize}`
        );
        const result = await response.json();
        return {
          data: result.list,       // 当前页数据
          success: true,           // 请求是否成功
          total: result.total,     // 数据总条数（用于分页）
        };
      }}
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
      }}
      rowKey="id"
      metas={{
        title: {
          dataIndex: 'title',
        },
        avatar: {
          dataIndex: 'avatar',
        },
        description: {
          render: (_, row) => `负责人：${row.owner} | 创建于 ${row.createdAt}`,
        },
        subTitle: {
          render: (_, row) => (
            <Tag color={priorityMap[row.priority]?.color}>
              {priorityMap[row.priority]?.text}优先级
            </Tag>
          ),
        },
        actions: {
          render: (_, row) => [
            <a key="edit" onClick={() => message.info(`编辑 ${row.title}`)}>
              编辑
            </a>,
            <a key="view" onClick={() => message.info(`查看 ${row.title}`)}>
              查看
            </a>,
          ],
        },
      }}
    />
  );
};

export default TaskList;
```

**request 返回值约定**（与 ProTable 一致）：

```typescript
{
  data: T[];        // 当前页数据数组
  success: boolean; // 是否成功
  total: number;    // 总条数，用于分页计算
}
```

## 卡片列表（grid 模式）

设置 `grid` 属性即可将列表切换为卡片网格布局，无需修改 `metas` 定义：

```tsx
import React, { useState } from 'react';
import { ProList } from '@ant-design/pro-components';
import { Button, Progress, Tag } from 'antd';
import { PlusOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';

interface ProjectItem {
  id: string;
  title: string;
  description: string;
  avatar: string;
  status: 'active' | 'inactive' | 'completed';
  progress: number;
}

const projects: ProjectItem[] = [
  {
    id: '1',
    title: '电商平台重构',
    description: '基于 React 18 + ProComponents 的电商后台系统重构项目。',
    avatar: 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24IOql2/weixintupian_20170331104822.jpg',
    status: 'active',
    progress: 65,
  },
  {
    id: '2',
    title: '数据分析仪表盘',
    description: '实时数据可视化与业务指标监控看板。',
    avatar: 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24IOql2/weixintupian_20170331104822.jpg',
    status: 'active',
    progress: 40,
  },
  {
    id: '3',
    title: '移动端 H5 商城',
    description: '面向消费者的移动端购物体验优化。',
    avatar: 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24IOql2/weixintupian_20170331104822.jpg',
    status: 'completed',
    progress: 100,
  },
  {
    id: '4',
    title: '微服务网关',
    description: 'API 网关统一鉴权、限流和日志收集。',
    avatar: 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24IOql2/weixintupian_20170331104822.jpg',
    status: 'inactive',
    progress: 10,
  },
];

const ProjectCardList: React.FC = () => {
  const [cardView, setCardView] = useState(true);

  return (
    <ProList<ProjectItem>
      headerTitle="项目列表"
      toolBarRender={() => [
        <Button
          key="view-toggle"
          icon={cardView ? <UnorderedListOutlined /> : <AppstoreOutlined />}
          onClick={() => setCardView(!cardView)}
        >
          {cardView ? '列表视图' : '卡片视图'}
        </Button>,
        <Button key="add" type="primary" icon={<PlusOutlined />}>
          新建项目
        </Button>,
      ]}
      dataSource={projects}
      rowKey="id"
      // grid 属性控制卡片布局；设为 false 或不传则为列表模式
      grid={
        cardView
          ? {
              gutter: 16,
              xs: 1,
              sm: 2,
              md: 2,
              lg: 3,
              xl: 4,
              xxl: 4,
            }
          : undefined
      }
      metas={{
        title: {
          dataIndex: 'title',
        },
        avatar: {
          dataIndex: 'avatar',
        },
        description: {
          dataIndex: 'description',
        },
        content: {
          render: (_, row) => (
            <div style={{ marginTop: 8 }}>
              <Progress
                percent={row.progress}
                size="small"
                status={row.status === 'completed' ? 'success' : 'active'}
              />
            </div>
          ),
        },
        subTitle: {
          render: (_, row) => {
            const colorMap = { active: 'processing', inactive: 'default', completed: 'success' };
            return <Tag color={colorMap[row.status]}>{row.status}</Tag>;
          },
        },
        actions: {
          // 在 grid 模式下，actions 显示在卡片底部
          cardActionProps: 'actions', // 'actions' | 'extra'，控制操作按钮在卡片中的位置
          render: (_, row) => [
            <a key="edit">编辑</a>,
            <a key="detail">详情</a>,
          ],
        },
      }}
    />
  );
};

export default ProjectCardList;
```

**grid 关键点**：
- `grid` 接受 antd List 的 grid 配置（`gutter`、`xs`~`xxl` 列数）
- 设置 `grid` 后，每个列表项会自动渲染为 Card
- `metas.actions.cardActionProps` 控制操作按钮在卡片中的展示位置：`'actions'`（卡片底部 actions 区）或 `'extra'`（卡片右上角 extra 区）

## 带操作的列表项

通过 `metas.actions` 定义每行的操作按钮，配合 `editable` 实现行内编辑：

```tsx
import React, { useRef } from 'react';
import { ProList } from '@ant-design/pro-components';
import type { ActionType } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Space, Tag } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';

interface UserItem {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'admin' | 'editor' | 'viewer';
  department: string;
}

const UserManageList: React.FC = () => {
  const actionRef = useRef<ActionType>();

  const handleDelete = async (id: string) => {
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    message.success('删除成功');
    actionRef.current?.reload(); // 手动触发列表刷新
  };

  return (
    <ProList<UserItem>
      actionRef={actionRef}
      headerTitle="用户管理"
      toolBarRender={() => [
        <Button key="add" type="primary" icon={<PlusOutlined />}>
          添加用户
        </Button>,
      ]}
      request={async (params) => {
        const res = await fetch(`/api/users?page=${params.current}&size=${params.pageSize}`);
        const data = await res.json();
        return { data: data.list, total: data.total, success: true };
      }}
      pagination={{ pageSize: 10 }}
      rowKey="id"
      // 行选择
      rowSelection={{}}
      // 批量操作栏
      tableAlertOptionRender={({ selectedRowKeys, onCleanSelected }) => (
        <Space>
          <a onClick={() => { message.info(`批量操作 ${selectedRowKeys.length} 项`); }}>
            批量启用
          </a>
          <a onClick={onCleanSelected}>取消选择</a>
        </Space>
      )}
      metas={{
        title: {
          dataIndex: 'name',
        },
        avatar: {
          dataIndex: 'avatar',
        },
        description: {
          render: (_, row) => `${row.email} | ${row.department}`,
        },
        subTitle: {
          render: (_, row) => {
            const roleColor = { admin: 'red', editor: 'blue', viewer: 'default' };
            return <Tag color={roleColor[row.role]}>{row.role}</Tag>;
          },
        },
        actions: {
          render: (_, row) => [
            <a key="edit" onClick={() => message.info(`编辑用户 ${row.name}`)}>
              <EditOutlined /> 编辑
            </a>,
            <Popconfirm
              key="delete"
              title="确定删除该用户？"
              onConfirm={() => handleDelete(row.id)}
            >
              <a style={{ color: '#ff4d4f' }}>
                <DeleteOutlined /> 删除
              </a>
            </Popconfirm>,
          ],
        },
      }}
    />
  );
};

export default UserManageList;
```

## 带搜索和分页

ProList 继承了 ProTable 的搜索能力。可以通过 `search` 配置表单搜索，或用 `toolbar.search` 添加简易搜索框：

```tsx
import React from 'react';
import { ProList } from '@ant-design/pro-components';
import { Tag } from 'antd';

interface OrderItem {
  id: string;
  orderNo: string;
  title: string;
  amount: number;
  status: 'pending' | 'paid' | 'shipped' | 'completed';
  createdAt: string;
}

const OrderList: React.FC = () => {
  return (
    <ProList<OrderItem>
      headerTitle="订单列表"
      // 方式 1：简易搜索框（在 toolbar 右侧显示搜索输入框）
      options={{
        search: {
          placeholder: '搜索订单号或名称',
          // 输入内容会作为 params.keyword 传给 request
        },
      }}
      // 方式 2：完整搜索表单（与 ProTable 的 search 一致）
      // search={{
      //   filterType: 'light', // 'query'（默认展开表单）| 'light'（轻量筛选器）
      // }}
      request={async (params) => {
        // params 包含搜索/筛选字段 + { current, pageSize, keyword }
        const query = new URLSearchParams({
          page: String(params.current),
          size: String(params.pageSize),
          ...(params.keyword ? { keyword: params.keyword } : {}),
        });
        const res = await fetch(`/api/orders?${query}`);
        const data = await res.json();
        return { data: data.list, success: true, total: data.total };
      }}
      pagination={{
        pageSize: 20,
        showSizeChanger: true,
        showQuickJumper: true,
      }}
      rowKey="id"
      metas={{
        title: {
          dataIndex: 'title',
          // 当使用 search={{ filterType: 'query' }} 时，
          // 带 dataIndex 的 metas 字段会自动生成搜索表单项
        },
        description: {
          render: (_, row) =>
            `订单号：${row.orderNo} | 金额：¥${row.amount.toFixed(2)} | ${row.createdAt}`,
          // search: false 可以禁止该字段出现在搜索表单中
        },
        subTitle: {
          render: (_, row) => {
            const statusMap: Record<string, { text: string; color: string }> = {
              pending: { text: '待支付', color: 'warning' },
              paid: { text: '已支付', color: 'processing' },
              shipped: { text: '已发货', color: 'cyan' },
              completed: { text: '已完成', color: 'success' },
            };
            const s = statusMap[row.status];
            return <Tag color={s?.color}>{s?.text}</Tag>;
          },
        },
        actions: {
          render: (_, row) => [
            <a key="detail">详情</a>,
            row.status === 'pending' && <a key="pay">去支付</a>,
          ].filter(Boolean),
        },
      }}
    />
  );
};

export default OrderList;
```

## metas 配置速查

`metas` 是 ProList 的核心概念，替代 ProTable 的 `columns`，用于定义列表项各区域的内容。每个 meta 字段支持以下配置：

| meta 字段 | 布局位置 | 说明 |
|---|---|---|
| `title` | 列表项标题（加粗） | 主标题，支持 `dataIndex` 直接映射或 `render` 自定义 |
| `subTitle` | 标题右侧 | 常放 Tag、状态标识 |
| `description` | 标题下方灰色文字 | 简短描述 |
| `avatar` | 左侧头像 | 传 URL 字符串自动渲染 Avatar |
| `content` | 主内容区（description 下方） | 适合放富内容：图表、进度条等 |
| `actions` | 右侧操作区 / 卡片底部 | 操作按钮数组，`cardActionProps` 控制卡片模式下位置 |
| `type` | - | 固定值 `'new'` 或 `'top'`，可给特定条目添加特殊样式 |

**每个 meta 字段都支持的通用属性**：

```typescript
{
  dataIndex: string | string[];  // 数据字段路径
  valueType?: string;            // 值类型（text/date/money 等，同 ProTable）
  render?: (text, record, index) => ReactNode;  // 自定义渲染
  search?: false | { transform: (v) => any };   // 搜索表单配置，false=不参与搜索
}
```

## 与 ProTable 对比选型

| 对比维度 | ProList | ProTable |
|---|---|---|
| **数据形态** | 非结构化/半结构化：文章、任务、通知 | 强结构化：表格数据 |
| **布局** | 列表 + 卡片（grid）两种模式 | 仅表格 |
| **定义方式** | `metas`（按区域映射） | `columns`（按列映射） |
| **适用场景** | 内容展示、应用市场、管理面板 | 数据管理、CRUD、报表 |
| **共享能力** | request / pagination / search / toolBarRender / rowSelection / actionRef 完全一致 |

**选型建议**：
- 数据有明确的多列结构 -> ProTable
- 每条数据是一个"卡片/条目"，有标题+描述+头像+操作 -> ProList
- 需要卡片网格展示 -> ProList + grid
- 两者 API 高度相似，迁移成本很低

## 关键 Props 速查

| Prop | 类型 | 说明 |
|---|---|---|
| `dataSource` | `T[]` | 静态数据源（与 request 二选一） |
| `request` | `(params, sort, filter) => Promise<{ data, success, total }>` | 远程数据请求函数 |
| `metas` | `ProListMetas<T>` | 列表项各区域配置（见上表） |
| `grid` | `false \| { gutter, xs, sm, md, lg, xl, xxl }` | 卡片网格配置，不传或 false 为列表模式 |
| `pagination` | `false \| PaginationConfig` | 分页配置，false 禁用分页 |
| `search` | `false \| SearchConfig` | 搜索表单配置 |
| `headerTitle` | `ReactNode` | 列表标题 |
| `toolBarRender` | `() => ReactNode[]` | 工具栏右侧按钮 |
| `rowSelection` | `TableRowSelection \| {}` | 行选择配置，传 `{}` 即可启用 |
| `actionRef` | `MutableRefObject<ActionType>` | 操作引用（reload/reset/clearSelected） |
| `rowKey` | `string \| (record) => string` | 行唯一标识（必须设置） |
| `showActions` | `'hover' \| 'always'` | 操作按钮显示时机，默认 `'always'` |
| `showExtra` | `'hover' \| 'always'` | extra 区域显示时机 |
| `itemLayout` | `'horizontal' \| 'vertical'` | 列表项布局方向 |
| `onRow` | `(record, index) => HTMLAttributes` | 行属性（支持 onClick 等事件） |
| `ghost` | `boolean` | 幽灵模式，去掉卡片 padding |
| `cardProps` | `CardProps` | grid 模式下传给 Card 的属性 |
| `itemCardProps` | `CardProps` | 每个列表项 Card 的属性（grid 模式） |
| `tableAlertRender` | `(selectedRowKeys, selectedRows, onCleanSelected) => ReactNode` | 批量选择提示栏 |
| `tableAlertOptionRender` | 同上 | 批量选择操作区 |
| `locale` | `{ emptyText: ReactNode }` | 空状态文案 |
| `split` | `boolean` | 是否显示列表项分割线 |
| `expandable` | `ExpandableConfig` | 可展开行配置 |
| `editable` | `EditableConfig` | 行内编辑配置 |

## 注意事项

1. **rowKey 必须设置**：不设置会导致 React key 警告和渲染异常，推荐用数据中的唯一 ID 字段
2. **request 返回格式严格**：必须返回 `{ data: T[], success: boolean, total: number }`，字段名不可更改；如果后端字段名不同，在 request 函数内做映射
3. **metas 与 columns 不要混用**：ProList 虽底层基于 ProTable，但使用 `metas` 而非 `columns`；如果传了 `columns`，ProList 会退化为 ProTable 的行为
4. **grid 模式下 actions 位置**：默认操作按钮不可见，需要设置 `metas.actions.cardActionProps` 为 `'actions'`（卡片底部）或 `'extra'`（右上角）
5. **search 与 options.search 区别**：`search` 是完整的搜索表单（同 ProTable），`options.search` 是 toolbar 上的简易搜索框（作为 `keyword` 参数传递）
6. **actionRef.current.reload()** 是刷新列表的标准方式，用于删除/新增后重新拉取数据
7. **TypeScript 泛型**：`ProList<T>` 支持泛型，传入数据类型后 metas 的 render 函数会获得正确的类型推断
8. **空列表**：默认显示 antd Empty 组件，可通过 `locale={{ emptyText: <自定义组件> }}` 自定义

## 组合提示

- **PageContainer**：ProList 通常放在 `PageContainer` 内，提供面包屑和页头
- **ProCard**：用 ProCard 包裹 ProList 可添加额外的统计信息区域
- **ModalForm / DrawerForm**：列表操作按钮点击后弹出表单，用于新建/编辑
- **ProTable**：同一页面中 ProList 展示概览、点击后跳转 ProTable 查看详情是常见模式
- **Statistic**：列表上方放统计卡片，形成"统计 + 列表"的经典管理后台布局
