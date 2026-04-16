---
name: ant-pro-descriptions
description: "ProDescriptions 高级描述列表，支持可编辑模式、请求加载、自定义渲染。"
tech_stack: [antd]
---

# ProDescriptions（高级描述列表）

> 来源：https://procomponents.ant.design/components/descriptions

## 核心场景

ProDescriptions 是 `@ant-design/pro-components` 对 antd `Descriptions` 的增强封装，核心优势：

1. **columns 驱动**：用与 ProTable 相同的 columns 配置描述字段，告别手写 `<Descriptions.Item>`
2. **内置 request**：声明一个异步函数即可自动加载数据，自带 loading 状态管理
3. **字段级可编辑**：通过 `editable` 配置实现行内编辑，无需额外 Form 包裹
4. **valueType 体系**：money / date / percent / select / code 等 20+ 种预设渲染格式
5. **与 ProTable 列复用**：同一套 columns 既可渲染列表，也可渲染详情，减少重复定义

适用于：后台管理系统的详情页、订单/工单详情弹窗、用户资料卡片、可编辑配置面板。

---

## 安装

```bash
# 推荐：统一安装 pro-components（包含 ProTable, ProForm, ProDescriptions 等）
npm install @ant-design/pro-components

# 确保 peer dependencies
npm install antd @ant-design/icons
```

```tsx
import { ProDescriptions } from '@ant-design/pro-components';
```

---

## 基础用法：只读详情页

最常见场景 -- 通过 `request` 异步加载数据，columns 定义字段布局和渲染格式。

```tsx
import React from 'react';
import { ProDescriptions } from '@ant-design/pro-components';
import { Badge } from 'antd';
import type { ProDescriptionsItemProps } from '@ant-design/pro-components';

// 1. 定义数据类型
interface OrderDetail {
  orderId: string;
  orderName: string;
  status: 'processing' | 'success' | 'error';
  amount: number;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  customerPhone: string;
  address: string;
  remark: string;
}

// 2. 定义 columns —— 与 ProTable 完全兼容的配置
const columns: ProDescriptionsItemProps<OrderDetail>[] = [
  {
    title: '订单编号',
    dataIndex: 'orderId',
    copyable: true,
  },
  {
    title: '订单名称',
    dataIndex: 'orderName',
  },
  {
    title: '状态',
    dataIndex: 'status',
    valueEnum: {
      processing: { text: '处理中', status: 'Processing' },
      success: { text: '已完成', status: 'Success' },
      error: { text: '异常', status: 'Error' },
    },
  },
  {
    title: '金额',
    dataIndex: 'amount',
    valueType: 'money',
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    valueType: 'dateTime',
  },
  {
    title: '更新时间',
    dataIndex: 'updatedAt',
    valueType: 'dateTime',
  },
  {
    title: '客户姓名',
    dataIndex: 'customerName',
  },
  {
    title: '联系电话',
    dataIndex: 'customerPhone',
    copyable: true,
  },
  {
    title: '收货地址',
    dataIndex: 'address',
    span: 2,
    ellipsis: true,
  },
  {
    title: '备注',
    dataIndex: 'remark',
    valueType: 'textarea',
    span: 3,
  },
];

// 3. 模拟 API 请求
const fetchOrderDetail = async (params: { orderId: string }) => {
  // 实际项目中替换为真实 API
  const data: OrderDetail = {
    orderId: params.orderId,
    orderName: '年度采购合同-A',
    status: 'processing',
    amount: 125600.5,
    createdAt: '2024-03-15 10:30:00',
    updatedAt: '2024-03-16 14:22:00',
    customerName: '张三',
    customerPhone: '13800138000',
    address: '浙江省杭州市西湖区文三路 388 号',
    remark: '请尽快处理，客户催单中',
  };
  return { data, success: true };
};

// 4. 页面组件
const OrderDetailPage: React.FC<{ orderId: string }> = ({ orderId }) => {
  return (
    <ProDescriptions<OrderDetail>
      title="订单详情"
      tooltip="订单基本信息"
      bordered
      column={3}
      columns={columns}
      request={async () => {
        const res = await fetchOrderDetail({ orderId });
        return { data: res.data, success: res.success };
      }}
      // params 变化时自动重新请求
      params={{ orderId }}
    />
  );
};

export default OrderDetailPage;
```

**要点**：
- `request` 返回 `{ data: T, success: boolean }`，组件自动管理 loading
- `params` 变化会触发 `request` 重新执行（类似 useEffect 的 deps）
- `column` 控制每行显示几个字段，支持响应式 `{ xs: 1, sm: 2, md: 3 }`

---

## 可编辑模式

ProDescriptions 支持字段级行内编辑，适用于"查看+修改"一体化的配置面板。

```tsx
import React, { useRef } from 'react';
import { ProDescriptions } from '@ant-design/pro-components';
import type {
  ProDescriptionsItemProps,
  ActionType,
} from '@ant-design/pro-components';
import { message } from 'antd';

interface UserProfile {
  id: string;
  username: string;
  nickname: string;
  email: string;
  role: string;
  bio: string;
  status: 'active' | 'inactive';
}

const columns: ProDescriptionsItemProps<UserProfile>[] = [
  {
    title: '用户ID',
    dataIndex: 'id',
    editable: false, // 不可编辑
    copyable: true,
  },
  {
    title: '用户名',
    dataIndex: 'username',
    editable: false, // 用户名不允许修改
  },
  {
    title: '昵称',
    dataIndex: 'nickname',
    formItemProps: {
      rules: [{ required: true, message: '昵称不能为空' }],
    },
  },
  {
    title: '邮箱',
    dataIndex: 'email',
    formItemProps: {
      rules: [
        { required: true, message: '邮箱不能为空' },
        { type: 'email', message: '请输入有效邮箱' },
      ],
    },
  },
  {
    title: '角色',
    dataIndex: 'role',
    valueType: 'select',
    valueEnum: {
      admin: '管理员',
      editor: '编辑',
      viewer: '查看者',
    },
  },
  {
    title: '状态',
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: {
      active: { text: '启用', status: 'Success' },
      inactive: { text: '禁用', status: 'Default' },
    },
  },
  {
    title: '个人简介',
    dataIndex: 'bio',
    valueType: 'textarea',
    span: 3,
    fieldProps: {
      rows: 3,
      maxLength: 200,
      showCount: true,
    },
  },
];

const EditableProfilePanel: React.FC = () => {
  const actionRef = useRef<ActionType>();

  return (
    <ProDescriptions<UserProfile>
      title="用户资料"
      bordered
      column={3}
      actionRef={actionRef}
      columns={columns}
      editable={{
        // 保存回调 —— 返回 true 或 resolve 即视为成功
        onSave: async (key, record, originRow) => {
          console.log('保存字段:', key, '新值:', record, '旧值:', originRow);
          // 实际项目中调用 API
          // await updateUserProfile(record);
          message.success(`字段 "${key as string}" 已更新`);
          return true;
        },
        onCancel: async (key) => {
          console.log('取消编辑:', key);
        },
      }}
      request={async () => {
        // 加载用户数据
        const data: UserProfile = {
          id: 'USR-20240315001',
          username: 'zhangsan',
          nickname: '张三',
          email: 'zhangsan@example.com',
          role: 'editor',
          bio: '一个普通的编辑人员',
          status: 'active',
        };
        return { data, success: true };
      }}
    />
  );
};

export default EditableProfilePanel;
```

**要点**：
- 每个字段旁会出现编辑图标，点击后切换为表单控件
- `editable: false` 的字段不显示编辑图标
- `formItemProps.rules` 控制编辑态的校验规则
- `onSave` 的 `key` 是 `dataIndex`，`record` 是编辑后的完整数据
- 调用 `actionRef.current?.reload()` 可手动触发重新加载

---

## columns 配置详解

### valueType 常用类型

| valueType | 展示效果 | 编辑态控件 |
|---|---|---|
| `text` (默认) | 原样文本 | Input |
| `money` | `¥ 1,256.00` | InputNumber |
| `date` | `2024-03-15` | DatePicker |
| `dateTime` | `2024-03-15 10:30:00` | DateTimePicker |
| `digit` | `12,345` (千分位) | InputNumber |
| `percent` | `85.5%` | InputNumber |
| `select` | 根据 valueEnum 渲染 | Select |
| `textarea` | 多行文本 | TextArea |
| `code` | 等宽字体代码块 | TextArea |
| `jsonCode` | JSON 格式化展示 | CodeEditor |
| `progress` | 进度条 | InputNumber |
| `avatar` | 头像 | Upload |
| `image` | 图片 | Upload |
| `switch` | 开关状态 | Switch |
| `rate` | 星级评分 | Rate |

### render 自定义渲染

```tsx
{
  title: '合同附件',
  dataIndex: 'attachments',
  render: (_, record) => {
    if (!record.attachments?.length) return '-';
    return (
      <Space>
        {record.attachments.map((file) => (
          <a key={file.id} href={file.url} target="_blank" rel="noreferrer">
            {file.name}
          </a>
        ))}
      </Space>
    );
  },
}
```

### valueEnum 状态渲染

```tsx
{
  title: '审批状态',
  dataIndex: 'approvalStatus',
  valueEnum: {
    draft:      { text: '草稿',   status: 'Default' },
    pending:    { text: '待审批', status: 'Processing' },
    approved:   { text: '已通过', status: 'Success' },
    rejected:   { text: '已驳回', status: 'Error' },
    cancelled:  { text: '已取消', status: 'Default', disabled: true },
  },
}
```

### hideInDescriptions

当 columns 同时用于 ProTable 和 ProDescriptions 时，部分字段只需在表格中显示：

```tsx
{
  title: '操作',
  valueType: 'option',
  hideInDescriptions: true, // 详情页不显示"操作"列
}
```

---

## 与 ProTable 详情弹窗配合

这是最典型的管理系统模式：表格列表 + 点击行打开详情 Drawer。columns 复用是关键。

```tsx
import React, { useState } from 'react';
import { ProTable, ProDescriptions } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Drawer, Button } from 'antd';

interface ProductItem {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: 'on_sale' | 'off_sale';
  createdAt: string;
  description: string;
}

// 共享 columns —— 同时用于 ProTable 和 ProDescriptions
const sharedColumns: ProColumns<ProductItem>[] = [
  {
    title: '商品ID',
    dataIndex: 'id',
    copyable: true,
    width: 120,
  },
  {
    title: '商品名称',
    dataIndex: 'name',
    ellipsis: true,
  },
  {
    title: '分类',
    dataIndex: 'category',
    valueType: 'select',
    valueEnum: {
      electronics: '电子产品',
      clothing: '服装',
      food: '食品',
    },
  },
  {
    title: '价格',
    dataIndex: 'price',
    valueType: 'money',
    sorter: true,
    hideInSearch: true,
  },
  {
    title: '库存',
    dataIndex: 'stock',
    valueType: 'digit',
    hideInSearch: true,
  },
  {
    title: '状态',
    dataIndex: 'status',
    valueEnum: {
      on_sale: { text: '在售', status: 'Success' },
      off_sale: { text: '下架', status: 'Default' },
    },
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    valueType: 'dateTime',
    hideInSearch: true,
    hideInTable: true, // 表格中隐藏，详情页显示
  },
  {
    title: '商品描述',
    dataIndex: 'description',
    valueType: 'textarea',
    hideInTable: true, // 表格中隐藏
    hideInSearch: true,
    span: 3,
  },
  {
    title: '操作',
    valueType: 'option',
    hideInDescriptions: true, // 详情页隐藏
    width: 120,
    render: (_, record, __, action) => [
      <a key="view" onClick={() => onViewDetail(record)}>
        查看
      </a>,
    ],
  },
];

// 需要在组件外声明一个占位，实际在组件内赋值
let onViewDetail: (record: ProductItem) => void = () => {};

const ProductListPage: React.FC = () => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<ProductItem>();

  // 赋值查看详情回调
  onViewDetail = (record: ProductItem) => {
    setCurrentRecord(record);
    setDrawerVisible(true);
  };

  return (
    <>
      <ProTable<ProductItem>
        headerTitle="商品列表"
        rowKey="id"
        columns={sharedColumns}
        request={async (params) => {
          // 替换为真实 API
          const mockData: ProductItem[] = [
            {
              id: 'P001',
              name: '无线蓝牙耳机',
              category: 'electronics',
              price: 299.0,
              stock: 1500,
              status: 'on_sale',
              createdAt: '2024-01-10 09:00:00',
              description: '高品质降噪蓝牙耳机，续航 30 小时',
            },
            {
              id: 'P002',
              name: '纯棉 T 恤',
              category: 'clothing',
              price: 89.0,
              stock: 3200,
              status: 'on_sale',
              createdAt: '2024-02-20 14:00:00',
              description: '100% 纯棉面料，舒适透气',
            },
          ];
          return { data: mockData, success: true, total: mockData.length };
        }}
      />

      {/* 详情 Drawer —— 复用同一套 columns */}
      <Drawer
        title="商品详情"
        width={720}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {currentRecord && (
          <ProDescriptions<ProductItem>
            bordered
            column={2}
            columns={sharedColumns}
            dataSource={currentRecord}
          />
        )}
      </Drawer>
    </>
  );
};

export default ProductListPage;
```

**模式要点**：
- `hideInTable: true` 的字段只在详情页展示（如描述、创建时间）
- `hideInDescriptions: true` 的字段只在表格展示（如操作列）
- `hideInSearch: true` 的字段不出现在表格搜索栏
- `dataSource` 用于静态数据传入（已有数据时无需 request）
- 如果详情页需要更多字段，可以用 `[...sharedColumns, ...extraColumns]` 扩展

---

## 关键 Props 速查

### ProDescriptions Props

| Prop | 类型 | 说明 |
|---|---|---|
| `columns` | `ProDescriptionsItemProps[]` | 字段配置（与 ProTable columns 兼容） |
| `request` | `(params) => Promise<{data, success}>` | 异步数据加载 |
| `params` | `Record<string, any>` | 传递给 request 的额外参数，变化时触发重新请求 |
| `dataSource` | `T` | 静态数据源（与 request 二选一） |
| `editable` | `EditableConfig` | 可编辑配置（onSave / onCancel） |
| `actionRef` | `MutableRefObject<ActionType>` | 命令式操作（reload 等） |
| `column` | `number \| {xs,sm,md,lg,xl,xxl}` | 每行字段数，默认 3 |
| `bordered` | `boolean` | 是否显示边框 |
| `title` | `ReactNode` | 标题 |
| `tooltip` | `string` | 标题旁的提示 |
| `extra` | `ReactNode` | 右上角额外内容 |
| `size` | `'default' \| 'middle' \| 'small'` | 尺寸 |
| `loading` | `boolean` | 手动控制 loading（使用 request 时自动管理） |
| `layout` | `'horizontal' \| 'vertical'` | 布局方向 |

### Column Item Props

| Prop | 类型 | 说明 |
|---|---|---|
| `dataIndex` | `string \| string[]` | 数据字段路径 |
| `valueType` | `string` | 渲染类型（见上方表格） |
| `valueEnum` | `Record<string, {text, status}>` | 枚举映射 |
| `render` | `(dom, entity, index, action, schema) => ReactNode` | 完全自定义渲染 |
| `copyable` | `boolean` | 显示复制按钮 |
| `ellipsis` | `boolean` | 超长截断 |
| `editable` | `boolean \| (text, record) => boolean` | 是否可编辑 |
| `span` | `number` | 跨列数 |
| `fieldProps` | `object` | 传递给底层表单控件的 props |
| `formItemProps` | `object` | 传递给 Form.Item 的 props（含 rules） |
| `hideInDescriptions` | `boolean` | 在 ProDescriptions 中隐藏 |

### ActionType (actionRef)

| 方法 | 说明 |
|---|---|
| `reload()` | 重新执行 request 加载数据 |
| `clearSelected()` | 清除选择（继承自 ProTable） |

---

## 注意事项

1. **request vs dataSource 二选一**：同时传两个时 `dataSource` 优先，`request` 不会执行。需要异步加载就只用 `request`。

2. **params 触发重请求**：`params` 对象引用变化就会触发 `request` 重执行。避免在 render 中创建新对象：
   ```tsx
   // 错误：每次渲染都创建新对象，导致无限请求
   <ProDescriptions params={{ id: orderId }} request={...} />

   // 正确：用 useMemo 稳定引用
   const params = useMemo(() => ({ id: orderId }), [orderId]);
   <ProDescriptions params={params} request={...} />
   ```

3. **editable onSave 的 record 是完整对象**：不只是被编辑的字段，而是合并后的完整数据。diff 变化需自行对比 `record` 和 `originRow`。

4. **columns 与 JSX children 不要混用**：要么纯用 `columns` 配置，要么纯用 `<ProDescriptions.Item>` 子元素。混用时行为不可预测。

5. **valueEnum 的 status 值**：必须是 antd Badge 支持的 status 值之一：`'Success' | 'Error' | 'Default' | 'Processing' | 'Warning'`，注意首字母大写。

6. **span 跨列**：`span` 值不能超过 `column` 设置的总列数，否则布局会错乱。

7. **TypeScript 泛型**：始终为 ProDescriptions 提供泛型参数 `ProDescriptions<YourType>`，这样 columns 的 dataIndex 和 render 都能获得类型提示。
