---
name: data-table-frontend
description: 后台管理"表格 + 工具栏 + 分页 + 排序 + 选中 + 批量操作"场景必须用 `DataTable`,禁止自行 antd Table + useState 拼合并状态。
---

# `@dt/data-table`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `DataTable`:

- 后台管理 / CRM / CMS 的"列表 + 详情"页面(表格层)
- 需要受控分页 / 排序 / 选中 + 批量操作(删除 / 导出 / 修改状态)
- 需要顶部工具栏:搜索 + "新建"按钮 + 列定义统一管理
- 需要"零行"/"加载失败"统一处理

## 何时**不**使用

- 卡片网格 / 瀑布流(图文目录类) → `card-flow`
- 树状层级(文件夹 / 组织架构) → `tree-explorer`(待建)
- 左列表 + 右详情同屏 → `master-detail`(本块可作为它的 list 端 render)
- 仅展示一行的属性表 → 用 antd `Descriptions`
- 拖拽看板 → 不适配
- 10k+ 行虚拟滚动需求 → 本块未做窗口化

## 安装

```bash
pnpm add file:./sdk/ui-chrome/data-table/frontend
```

## 最小用法

```tsx
import { useState } from 'react';
import { DataTable } from '@dt/data-table';
import type { ColumnDef, TableQuery } from '@dt/data-table';
import '@dt/data-table/styles.css';

const [query, setQuery] = useState<TableQuery>({ page: 1, pageSize: 20 });
const { items, total, loading, error } = useMyData(query);

<DataTable
  items={items} total={total} loading={loading} error={error}
  getRowId={(r) => r.id}
  columns={[
    { key: 'name', title: '名称', dataIndex: 'name', sortable: true },
    { key: 'price', title: '价格', dataIndex: 'price', sortable: true, align: 'right' },
  ]}
  query={query}
  onQueryChange={setQuery}
/>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `items` | `T[]` | — | 当前页数据 |
| `total` | `number` | — | 全集总数(分页器需要) |
| `loading` | `boolean` | `false` | 表格 loading 覆盖层 |
| `error` | `Error \| null` | `null` | 非 null 且无数据时显示错误态 |
| `getRowId` | `(T) => string` | — | 取行 id |
| `columns` | `ColumnDef<T>[]` | — | 列定义 schema |
| `query` | `TableQuery` | — | `{ page, pageSize, sortBy?, sortOrder?, filters? }` 合并状态 |
| `onQueryChange` | `(q) => void` | — | 翻页/排序/筛选合并触发 |
| `selectable` | `boolean` | `false` | 行选择复选框 |
| `selectedKeys` | `string[]` | — | 受控选中 |
| `onSelectionChange` | `(keys, rows) => void` | — | 选中变化 |
| `batchActions` | `BatchAction<T>[]` | — | 选中时浮现的批量操作按钮 |
| `search` | `string` | — | 受控搜索(防抖由 host 加) |
| `onSearchChange` | `(s) => void` | — | 搜索变化 |
| `searchPlaceholder` | `string` | `'搜索'` | |
| `toolbarRight` | `ReactNode` | — | 工具栏右侧(新建按钮等) |
| `emptyState` | `ReactNode` | antd Empty | items 为空时 |
| `errorState` | `(err) => ReactNode` | antd Result | 自定义错误态 |
| `onRowClick` | `(row) => void` | — | 行点击(配 selectable 不冲突) |
| `height` | `string \| number` | `'100%'` | |
| `className` | `string` | — | |

`ColumnDef<T>`:`{ key, title, dataIndex?, render?, sortable?, width?, fixed?, align?, hidden? }`

`BatchAction<T>`:`{ key, label, icon?, danger?, disabled?, onClick }`

`TableQuery`:`{ page, pageSize, sortBy?, sortOrder?, filters? }`

## 内部已经处理好的事项

- ✅ antd Table 的 `onChange(pagination, filters, sorter)` 合并为单一 `onQueryChange`
- ✅ 排序的 `'ascend'/'descend'` ↔ `'asc'/'desc'` 转换
- ✅ 行选择:`selectedRowKeys` 接 string[],host 不用 cast
- ✅ 批量操作 toolbar:`已选 N 项` + danger 按钮 + 按选中数据禁用
- ✅ 错误态 fallback:`error && !items.length` → Result + 重试(触发 onQueryChange)
- ✅ `scroll={{ x: 'max-content' }}` 自动横向滚动(列宽超容器)
- ✅ sticky 表头
- ✅ pageSize 切换 + showTotal 默认开启

## 严格禁止的反模式

❌ **自己拼 antd Table + 多个 useState**:本块就是为了合并 `pagination` / `sorter` / `filters` 到单一 `query`;每次手写都会漏 sorter 转换 / 翻页重置 / a11y

❌ **把 items 传成全集**:`items` 应该是**当前页**数据;翻页后由 host 重取。`total` 是全集总数

❌ **不传 `total`**:分页器算不出总页数,翻到第二页可能错乱

❌ **selectable + onRowClick 同时,选中复选框时还触发 onRowClick**:antd 默认行为是 checkbox 点击不冒泡到 row,本块沿用;**不要在 onRowClick 内手动 stopPropagation**

❌ **batchActions 的 onClick 同步抛错**:本块不 catch;host 自己 try/catch + toast

❌ **在 render 里发请求**:render 是纯函数,每次重渲都跑;数据应从 host 状态来

❌ **改 sdk 内的 DataTable.tsx**:加列定义钩子(如 `filter` UI)→ 在 host 写 column.render 自管;真有大需求扩 Props 而非 fork

## 状态

- v0.1 — 首版;后续可考虑:列显隐切换 UI、导出 CSV、虚拟滚动适配、列宽拖拽、多 sorter
