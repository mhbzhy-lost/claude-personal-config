---
name: ant-pro-table
description: "ProTable 高级表格，内置搜索表单、工具栏、CRUD 操作、分页。Use when building React admin apps with @ant-design/pro-components and need a data table with search, filters, and CRUD."
component: ProTable
package: "@ant-design/pro-components"
group: 高阶组件-数据展示
applies_to:
  markers_any:
    - "dependency: @ant-design/pro-components"
    - "dependency: antd"
priority: 10
tech_stack: [antd]
---

# ProTable（高级数据表格）

> 来源：https://procomponents.ant.design/components/table
> 真实用例参考：Ant Design Pro 官方模板 table-list 页面

## 核心场景

- 后台管理系统中带搜索、筛选、分页的数据列表页
- 需要 CRUD 操作（新建弹窗、编辑弹窗、删除确认、批量操作）
- 需要根据列的 valueType 自动渲染搜索表单（日期选择器、下拉框等）
- 行内编辑表格（EditableProTable）
- 需要工具栏（列设置、密度切换、刷新、全屏）

ProTable 基于 antd Table 封装，核心价值是 **columns 定义一次，同时驱动表格列渲染和搜索表单生成**。

## 安装

```bash
npm install @ant-design/pro-components
# 或
pnpm add @ant-design/pro-components
```

按需引入（推荐，减少打包体积）：

```tsx
import { ProTable } from '@ant-design/pro-components';
// 或单独包
import ProTable from '@ant-design/pro-table';
```

## 快速上手：最小可用 ProTable

```tsx
import React from 'react';
import type { ProColumns } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';

interface UserItem {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'disabled';
  createdAt: string;
}

const columns: ProColumns<UserItem>[] = [
  {
    title: '姓名',
    dataIndex: 'name',
    // valueType 默认 text，可省略
  },
  {
    title: '邮箱',
    dataIndex: 'email',
    copyable: true, // 显示复制按钮
    hideInSearch: true, // 搜索表单中不显示此字段
  },
  {
    title: '状态',
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: {
      active: { text: '启用', status: 'Success' },
      disabled: { text: '禁用', status: 'Error' },
    },
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    valueType: 'dateTime',
    hideInSearch: true,
    sorter: true,
  },
  {
    title: '创建时间范围',
    dataIndex: 'createdAt',
    valueType: 'dateRange',
    hideInTable: true, // 仅出现在搜索表单，不显示在表格列中
    search: {
      transform: (value: [string, string]) => ({
        startTime: value[0],
        endTime: value[1],
      }),
    },
  },
];

const UserTable: React.FC = () => {
  return (
    <ProTable<UserItem>
      headerTitle="用户列表"
      rowKey="id"
      columns={columns}
      request={async (params, sort, filter) => {
        // params 包含搜索表单值 + current + pageSize
        // sort: { createdAt: 'ascend' | 'descend' }
        // filter: 列筛选器的值
        const res = await fetch(
          `/api/users?page=${params.current}&size=${params.pageSize}&name=${params.name || ''}`
        );
        const data = await res.json();
        return {
          data: data.list,       // 必须
          success: true,         // 必须，false 时显示错误
          total: data.total,     // 必须，用于分页
        };
      }}
      pagination={{
        defaultPageSize: 10,
        showSizeChanger: true,
      }}
    />
  );
};

export default UserTable;
```

**request 返回格式约定**：必须返回 `{ data: T[], success: boolean, total: number }`。字段名不可更改（除非全局配置 `ProConfigProvider` 的 `request` 映射）。

## 搜索表单

ProTable 自动根据 columns 中未标记 `hideInSearch: true` 的列生成搜索表单。

### 搜索表单配置

```tsx
<ProTable
  search={{
    labelWidth: 'auto',          // 标签宽度，'auto' 或数字
    defaultCollapsed: true,      // 默认折叠（超过一行的字段隐藏）
    collapseRender: (collapsed) => (collapsed ? '展开' : '收起'),
    optionRender: (searchConfig, formProps, dom) => [
      ...dom,                    // 默认的查询/重置按钮
      <Button key="export" onClick={() => handleExport()}>导出</Button>,
    ],
    span: { xs: 24, sm: 12, md: 8, lg: 6, xl: 6 }, // 每个搜索项占的栅格
  }}
  // 关闭搜索表单
  // search={false}
/>
```

### valueType 与搜索表单控件映射

| valueType | 表格渲染 | 搜索表单控件 |
|---|---|---|
| `text` (默认) | 原样文本 | Input |
| `select` | 枚举文本 | Select（需配 valueEnum） |
| `date` | 日期 | DatePicker |
| `dateTime` | 日期时间 | DateTimePicker |
| `dateRange` | - | DateRangePicker |
| `dateTimeRange` | - | DateTimeRangePicker |
| `money` | ¥123.00 | InputNumber |
| `digit` | 数字 | InputNumber |
| `percent` | 12% | InputNumber（带 %） |
| `textarea` | 原样文本 | TextArea |
| `option` | 操作列 | 不出现在搜索表单 |
| `index` | 序号 | 不出现在搜索表单 |
| `indexBorder` | 带边框序号 | 不出现在搜索表单 |

### 搜索表单值转换

当搜索字段需要转换为不同的请求参数时，使用 `search.transform`：

```tsx
{
  title: '创建时间',
  dataIndex: 'createdAt',
  valueType: 'dateRange',
  hideInTable: true,
  search: {
    transform: (value: [string, string]) => ({
      createStartTime: value[0],
      createEndTime: value[1],
    }),
  },
}
```

### 自定义搜索表单项

```tsx
{
  title: '自定义',
  dataIndex: 'custom',
  renderFormItem: (item, { defaultRender, ...rest }, form) => {
    const status = form.getFieldValue('status');
    if (status === 'disabled') {
      return false; // 不渲染
    }
    return <CustomComponent {...rest} />;
  },
}
```

## CRUD 完整示例

下面是一个生产级的 CRUD 表格，包含新建、编辑、删除、批量操作：

```tsx
import React, { useRef, useState } from 'react';
import {
  ProTable,
  ModalForm,
  ProFormText,
  ProFormSelect,
  ProFormTextArea,
  PageContainer,
} from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Popconfirm, message, Space, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

// ---------- 类型定义 ----------

interface ProductItem {
  id: number;
  name: string;
  category: string;
  price: number;
  status: 'on_sale' | 'off_shelf' | 'draft';
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- API 模拟（替换为真实 API） ----------

async function fetchProducts(params: {
  current?: number;
  pageSize?: number;
  name?: string;
  status?: string;
}) {
  const res = await fetch('/api/products?' + new URLSearchParams({
    page: String(params.current ?? 1),
    size: String(params.pageSize ?? 10),
    ...(params.name ? { name: params.name } : {}),
    ...(params.status ? { status: params.status } : {}),
  }));
  const json = await res.json();
  return { data: json.list, success: true, total: json.total };
}

async function createProduct(data: Partial<ProductItem>) {
  return fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function updateProduct(id: number, data: Partial<ProductItem>) {
  return fetch(`/api/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function deleteProduct(id: number) {
  return fetch(`/api/products/${id}`, { method: 'DELETE' });
}

async function batchDeleteProducts(ids: number[]) {
  return fetch('/api/products/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

// ---------- 列定义 ----------

const statusEnum = {
  on_sale: { text: '在售', status: 'Success' },
  off_shelf: { text: '下架', status: 'Default' },
  draft: { text: '草稿', status: 'Processing' },
} as const;

// ---------- 新建/编辑弹窗 ----------

interface ProductFormProps {
  trigger: React.ReactElement;
  initialValues?: Partial<ProductItem>;
  onFinish: (values: Partial<ProductItem>) => Promise<boolean>;
  title: string;
}

const ProductForm: React.FC<ProductFormProps> = ({
  trigger,
  initialValues,
  onFinish,
  title,
}) => {
  return (
    <ModalForm<Partial<ProductItem>>
      title={title}
      trigger={trigger}
      initialValues={initialValues}
      autoFocusFirstInput
      modalProps={{ destroyOnClose: true }}
      onFinish={async (values) => {
        const success = await onFinish(values);
        return success; // true 关闭弹窗，false 保持打开
      }}
    >
      <ProFormText
        name="name"
        label="商品名称"
        rules={[{ required: true, message: '请输入商品名称' }]}
        width="md"
      />
      <ProFormSelect
        name="category"
        label="分类"
        width="md"
        options={[
          { label: '电子产品', value: 'electronics' },
          { label: '服装', value: 'clothing' },
          { label: '食品', value: 'food' },
        ]}
        rules={[{ required: true, message: '请选择分类' }]}
      />
      <ProFormText
        name="price"
        label="价格"
        width="sm"
        fieldProps={{ type: 'number', min: 0, step: 0.01 }}
        rules={[{ required: true, message: '请输入价格' }]}
      />
      <ProFormSelect
        name="status"
        label="状态"
        width="sm"
        valueEnum={statusEnum}
        rules={[{ required: true }]}
      />
      <ProFormTextArea
        name="description"
        label="描述"
        width="lg"
      />
    </ModalForm>
  );
};

// ---------- 主组件 ----------

const ProductTable: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const [selectedRows, setSelectedRows] = useState<ProductItem[]>([]);
  const [messageApi, contextHolder] = message.useMessage();

  const columns: ProColumns<ProductItem>[] = [
    {
      title: '商品名称',
      dataIndex: 'name',
      // 点击名称查看详情（常见模式）
      render: (dom, record) => (
        <a onClick={() => console.log('查看详情', record.id)}>{dom}</a>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      valueType: 'select',
      valueEnum: {
        electronics: { text: '电子产品' },
        clothing: { text: '服装' },
        food: { text: '食品' },
      },
    },
    {
      title: '价格',
      dataIndex: 'price',
      valueType: 'money',
      hideInSearch: true,
      sorter: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: statusEnum,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      valueType: 'dateTime',
      hideInSearch: true,
      sorter: true,
    },
    {
      title: '创建时间范围',
      dataIndex: 'createdAt',
      valueType: 'dateRange',
      hideInTable: true,
      search: {
        transform: (value: [string, string]) => ({
          createStartTime: value[0],
          createEndTime: value[1],
        }),
      },
    },
    {
      title: '操作',
      valueType: 'option',
      width: 180,
      render: (_, record) => [
        <ProductForm
          key="edit"
          title="编辑商品"
          trigger={<a>编辑</a>}
          initialValues={record}
          onFinish={async (values) => {
            try {
              await updateProduct(record.id, values);
              messageApi.success('更新成功');
              actionRef.current?.reload();
              return true;
            } catch {
              messageApi.error('更新失败');
              return false;
            }
          }}
        />,
        <Popconfirm
          key="delete"
          title="确定删除？"
          onConfirm={async () => {
            await deleteProduct(record.id);
            messageApi.success('删除成功');
            actionRef.current?.reload();
          }}
        >
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ],
    },
  ];

  return (
    <PageContainer>
      {contextHolder}
      <ProTable<ProductItem>
        headerTitle="商品管理"
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        request={fetchProducts}
        search={{
          labelWidth: 'auto',
          defaultCollapsed: true,
        }}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
        }}
        toolBarRender={() => [
          <ProductForm
            key="create"
            title="新建商品"
            trigger={
              <Button type="primary" icon={<PlusOutlined />}>
                新建
              </Button>
            }
            onFinish={async (values) => {
              try {
                await createProduct(values);
                messageApi.success('创建成功');
                actionRef.current?.reload();
                return true;
              } catch {
                messageApi.error('创建失败');
                return false;
              }
            }}
          />,
        ]}
        rowSelection={{
          onChange: (_, rows) => setSelectedRows(rows),
        }}
        tableAlertRender={({ selectedRowKeys, onCleanSelected }) => (
          <Space>
            已选 {selectedRowKeys.length} 项
            <a onClick={onCleanSelected}>取消选择</a>
          </Space>
        )}
        tableAlertOptionRender={() => (
          <Popconfirm
            title={`确定删除已选的 ${selectedRows.length} 项？`}
            onConfirm={async () => {
              await batchDeleteProducts(selectedRows.map((r) => r.id));
              messageApi.success('批量删除成功');
              setSelectedRows([]);
              actionRef.current?.reloadAndRest(); // 重新加载并重置到第一页
            }}
          >
            <Button type="link" danger>
              批量删除
            </Button>
          </Popconfirm>
        )}
      />
    </PageContainer>
  );
};

export default ProductTable;
```

## 批量操作

### 基础配置

```tsx
<ProTable
  rowSelection={{
    // 受控模式
    selectedRowKeys,
    onChange: (keys, rows) => {
      setSelectedRowKeys(keys);
      setSelectedRows(rows);
    },
    // 禁用某些行
    getCheckboxProps: (record) => ({
      disabled: record.status === 'locked',
    }),
  }}
  // 选中后的提示栏
  tableAlertRender={({ selectedRowKeys, selectedRows, onCleanSelected }) => (
    <Space>
      已选 {selectedRowKeys.length} 项
      <a onClick={onCleanSelected}>取消选择</a>
    </Space>
  )}
  // 提示栏右侧操作区
  tableAlertOptionRender={({ selectedRowKeys, onCleanSelected }) => (
    <Space>
      <Button onClick={() => handleBatchExport(selectedRowKeys)}>导出</Button>
      <Button danger onClick={() => handleBatchDelete(selectedRowKeys)}>删除</Button>
    </Space>
  )}
/>
```

### FooterToolbar 模式（固定在页面底部）

当选中项较多时，使用 FooterToolbar 比 tableAlertOptionRender 更醒目：

```tsx
import { FooterToolbar } from '@ant-design/pro-components';

// 在 ProTable 同级渲染
{selectedRows.length > 0 && (
  <FooterToolbar
    extra={<span>已选 {selectedRows.length} 项</span>}
  >
    <Button onClick={() => handleBatchApprove(selectedRows)}>
      批量审批
    </Button>
    <Button danger onClick={() => handleBatchDelete(selectedRows)}>
      批量删除
    </Button>
  </FooterToolbar>
)}
```

## columns 配置速查

### ProColumns 高频字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | `ReactNode` | 列标题 |
| `dataIndex` | `string \| string[]` | 数据字段名，支持嵌套 `['user', 'name']` |
| `valueType` | `string` | 数据类型，决定渲染和搜索控件 |
| `valueEnum` | `Record<string, {text, status}>` | 枚举映射，用于 select/radio/badge |
| `hideInSearch` | `boolean` | 搜索表单中隐藏 |
| `hideInTable` | `boolean` | 表格中隐藏（仅在搜索表单显示） |
| `hideInForm` | `boolean` | 新建/编辑表单中隐藏 |
| `sorter` | `boolean` | 启用排序（服务端排序在 request 的 sort 参数中获取） |
| `filters` | `boolean` | 启用列筛选器 |
| `copyable` | `boolean` | 显示复制按钮 |
| `ellipsis` | `boolean` | 超长文本省略 + Tooltip |
| `width` | `number \| string` | 列宽 |
| `fixed` | `'left' \| 'right'` | 固定列 |
| `render` | `(text, record, index, action) => ReactNode` | 自定义单元格渲染 |
| `renderText` | `(text, record) => string` | 渲染前转换文本 |
| `renderFormItem` | `(schema, config, form) => ReactNode` | 自定义搜索表单控件 |
| `search` | `false \| { transform }` | 搜索配置，`false` 禁用该列搜索 |
| `order` | `number` | 搜索表单中的排列顺序（数字越大越靠前） |
| `fieldProps` | `object` | 透传给搜索表单控件的 props |
| `formItemProps` | `object` | 透传给 Form.Item 的 props |
| `initialValue` | `any` | 搜索表单的默认值 |
| `request` | `() => Promise<{label, value}[]>` | 异步加载 select 选项（替代 valueEnum） |
| `dependencies` | `string[]` | 联动依赖字段，依赖变化时触发 request 重新执行 |

### valueEnum 状态标识

```tsx
valueEnum: {
  active:   { text: '启用', status: 'Success' },    // 绿色
  disabled: { text: '禁用', status: 'Error' },      // 红色
  pending:  { text: '待审', status: 'Processing' },  // 蓝色
  draft:    { text: '草稿', status: 'Default' },     // 灰色
  warning:  { text: '警告', status: 'Warning' },     // 黄色
}
```

### 联动搜索（dependencies + request）

```tsx
{
  title: '城市',
  dataIndex: 'city',
  valueType: 'select',
  dependencies: ['province'], // 当省份变化时重新请求城市列表
  request: async (params) => {
    // params.province 来自 dependencies 声明的字段
    if (!params.province) return [];
    const cities = await fetchCities(params.province);
    return cities.map((c) => ({ label: c.name, value: c.id }));
  },
}
```

## EditableProTable 行内编辑

适用于配置项管理、小批量数据编辑等场景。

```tsx
import React, { useState } from 'react';
import type { ProColumns } from '@ant-design/pro-components';
import { EditableProTable } from '@ant-design/pro-components';
import { Button, message } from 'antd';

interface ConfigItem {
  id: string;
  key: string;
  value: string;
  description?: string;
}

const ConfigTable: React.FC = () => {
  const [editableKeys, setEditableRowKeys] = useState<React.Key[]>([]);
  const [dataSource, setDataSource] = useState<ConfigItem[]>([
    { id: '1', key: 'APP_NAME', value: 'MyApp', description: '应用名称' },
    { id: '2', key: 'MAX_RETRY', value: '3', description: '最大重试次数' },
  ]);

  const columns: ProColumns<ConfigItem>[] = [
    {
      title: '配置键',
      dataIndex: 'key',
      formItemProps: {
        rules: [{ required: true, message: '必填' }],
      },
    },
    {
      title: '配置值',
      dataIndex: 'value',
      formItemProps: {
        rules: [{ required: true, message: '必填' }],
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
    },
    {
      title: '操作',
      valueType: 'option',
      width: 200,
      render: (text, record, _, action) => [
        <a key="edit" onClick={() => action?.startEditable?.(record.id)}>
          编辑
        </a>,
        <a
          key="delete"
          onClick={() => {
            setDataSource(dataSource.filter((item) => item.id !== record.id));
          }}
          style={{ color: '#ff4d4f' }}
        >
          删除
        </a>,
      ],
    },
  ];

  return (
    <EditableProTable<ConfigItem>
      headerTitle="系统配置"
      rowKey="id"
      columns={columns}
      value={dataSource}
      onChange={setDataSource}
      recordCreatorProps={{
        // 新增一行按钮配置
        position: 'bottom',
        newRecordType: 'dataSource', // 直接添加到 dataSource
        record: () => ({
          id: String(Date.now()),
          key: '',
          value: '',
        }),
        creatorButtonText: '新增配置项',
      }}
      editable={{
        type: 'multiple', // 'single' 只允许编辑一行，'multiple' 可同时编辑多行
        editableKeys,
        onChange: setEditableRowKeys,
        onSave: async (rowKey, data, row) => {
          console.log('保存行', rowKey, data);
          // 调用 API 保存
          message.success('保存成功');
        },
        onDelete: async (rowKey, row) => {
          console.log('删除行', rowKey);
          message.success('删除成功');
        },
        onCancel: async (rowKey) => {
          console.log('取消编辑', rowKey);
        },
        actionRender: (row, config, defaultDom) => [
          defaultDom.save,
          defaultDom.cancel,
          // defaultDom.delete, // 可选：在编辑态显示删除按钮
        ],
      }}
      // 关闭搜索表单（行内编辑表格通常不需要搜索）
      search={false}
    />
  );
};

export default ConfigTable;
```

### EditableProTable 受控 vs 非受控

```tsx
// 受控模式（推荐）：数据变化由外部 state 管理
<EditableProTable
  value={dataSource}
  onChange={setDataSource}
/>

// 非受控模式：由 request 加载，编辑后通过回调保存
<EditableProTable
  request={fetchData}
  editable={{
    onSave: async (key, record) => {
      await saveToServer(record);
    },
  }}
/>
```

## 关键 Props 速查

### ProTable Props

| Prop | 类型 | 说明 |
|---|---|---|
| `columns` | `ProColumns<T>[]` | 列定义（核心） |
| `request` | `(params, sort, filter) => Promise<{data, success, total}>` | 异步数据加载 |
| `params` | `object` | 额外请求参数，变化时自动重新请求 |
| `dataSource` | `T[]` | 静态数据模式（与 request 二选一） |
| `actionRef` | `MutableRefObject<ActionType>` | 操作引用，用于手动触发 reload 等 |
| `formRef` | `MutableRefObject<ProFormInstance>` | 搜索表单引用 |
| `headerTitle` | `ReactNode` | 表格标题 |
| `toolBarRender` | `(action, { selectedRowKeys, selectedRows }) => ReactNode[]` | 工具栏右侧自定义按钮 |
| `search` | `false \| SearchConfig` | 搜索表单配置 |
| `rowSelection` | `TableRowSelection` | 行选择配置（同 antd Table） |
| `tableAlertRender` | `((props) => ReactNode) \| false` | 选中行提示栏 |
| `tableAlertOptionRender` | `(props) => ReactNode` | 选中行操作区 |
| `pagination` | `false \| PaginationConfig` | 分页配置 |
| `polling` | `number` | 轮询间隔（毫秒），实现自动刷新 |
| `dateFormatter` | `'string' \| 'number' \| false` | 日期格式化方式 |
| `beforeSearchSubmit` | `(params) => params` | 搜索提交前处理参数 |
| `postData` | `(data: T[]) => T[]` | 请求完成后处理数据 |
| `onLoad` | `(dataSource: T[]) => void` | 数据加载完成回调 |
| `options` | `false \| { density, fullScreen, reload, setting }` | 工具栏选项 |
| `cardBordered` | `boolean` | 是否带边框卡片样式 |
| `ghost` | `boolean` | 幽灵模式（去除 padding） |

### ActionType 常用方法

```tsx
const actionRef = useRef<ActionType>(null);

// 刷新数据（保持当前页码和搜索条件）
actionRef.current?.reload();

// 刷新数据并重置到第一页
actionRef.current?.reloadAndRest();

// 重置搜索表单
actionRef.current?.reset();

// 清空选中项
actionRef.current?.clearSelected();

// 开始编辑某行（EditableProTable）
actionRef.current?.startEditable(rowKey);

// 取消编辑某行
actionRef.current?.cancelEditable(rowKey);
```

### formRef 常用方法

```tsx
const formRef = useRef<ProFormInstance>();

// 获取搜索表单值
const values = formRef.current?.getFieldsValue();

// 设置搜索表单值
formRef.current?.setFieldsValue({ status: 'active' });

// 提交搜索
formRef.current?.submit();

// 重置搜索
formRef.current?.resetFields();
```

## 与 PageContainer / ProForm 配合

### 典型页面结构

```tsx
import {
  PageContainer,
  ProTable,
  ModalForm,
  DrawerForm,
  ProFormText,
  ProDescriptions,
} from '@ant-design/pro-components';

const ListPage: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const [currentRow, setCurrentRow] = useState<DataType>();
  const [detailOpen, setDetailOpen] = useState(false);

  const columns: ProColumns<DataType>[] = [
    // ... 列定义
  ];

  return (
    <PageContainer>
      <ProTable<DataType>
        actionRef={actionRef}
        columns={columns}
        request={fetchData}
        rowKey="id"
        toolBarRender={() => [
          // ModalForm 作为 trigger 嵌入工具栏
          <ModalForm
            key="create"
            title="新建"
            trigger={<Button type="primary" icon={<PlusOutlined />}>新建</Button>}
            onFinish={async (values) => {
              await createItem(values);
              actionRef.current?.reload();
              return true;
            }}
          >
            <ProFormText name="name" label="名称" rules={[{ required: true }]} />
          </ModalForm>,
        ]}
      />

      {/* 详情抽屉 —— 复用 columns 定义 */}
      <DrawerForm
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={currentRow?.name}
        submitter={false}
      >
        <ProDescriptions<DataType>
          column={2}
          columns={columns}
          dataSource={currentRow}
        />
      </DrawerForm>
    </PageContainer>
  );
};
```

### columns 复用：ProDescriptions 详情

ProDescriptions 可以直接复用 ProTable 的 columns 定义来渲染详情：

```tsx
import type { ProDescriptionsItemProps } from '@ant-design/pro-components';

// 表格 columns 同时用于详情展示
<ProDescriptions<DataType>
  column={2}
  title={currentRow?.name}
  columns={columns as ProDescriptionsItemProps<DataType>[]}
  dataSource={currentRow}
/>
```

## 注意事项

1. **request 返回值字段名固定**：必须是 `{ data, success, total }`，不能自定义字段名（除非用 ProConfigProvider 的 request 配置全局映射）。
2. **rowKey 必须唯一**：默认 `'key'`，务必设置为数据的唯一标识字段（如 `'id'`），否则选中、编辑行为异常。
3. **request vs dataSource 不要混用**：如果传了 `request`，就不要同时传 `dataSource`，否则 `request` 被忽略。
4. **params 变化触发重新请求**：`params` prop 的引用变化会触发 request 重新执行，注意避免每次渲染产生新对象（用 `useMemo` 或 `useState`）。
5. **dateFormatter 默认是 'string'**：搜索表单中的日期会被转为 `YYYY-MM-DD` 字符串传给 request。如果后端需要时间戳，设 `dateFormatter="number"`。
6. **search.transform 注意类型**：`dateRange` 类型的 transform 接收 `[string, string]`，需展开为两个字段。
7. **EditableProTable 性能**：大数据量下避免 `type: 'multiple'`，每行编辑态都会渲染表单控件，建议用 `type: 'single'`。
8. **操作列用 valueType: 'option'**：这样该列自动不出现在搜索表单中，且在 ProDescriptions 中也会被正确处理。
9. **sorter 是服务端排序**：ProTable 的 `sorter: true` 只是传递排序信息给 request 的 `sort` 参数，不做前端排序。需要前端排序用 antd Table 原生的 `sorter` 函数。
10. **actionRef.current 可能为 null**：在 toolBarRender 等回调中使用时，注意可选链 `actionRef.current?.reload()`。
