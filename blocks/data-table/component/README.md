# data-table SDK

后台管理核心 UI chrome:`ColumnDef` schema + 受控查询(排序/分页/筛选)
+ 选中 + 批量操作 + 搜索 + 错误/空态。

底层用 antd `<Table>`,但把分散的 `pagination` / `onChange` / `rowSelection`
合并成 **单一 `query` + `onQueryChange`**,业务接入显著更简单。

```
component/
└── frontend/    DataTable + Toolbar 组件 + SKILL.md
```

## 整体复制

```bash
cp -r blocks/data-table/component your-project/sdk/ui-chrome/data-table
```

## 最小用法

```tsx
import { useState } from 'react';
import { DataTable } from '@dt/data-table';
import type { ColumnDef, TableQuery, BatchAction } from '@dt/data-table';
import '@dt/data-table/styles.css';

type Row = { id: string; name: string; price: number; stock: number };

const columns: ColumnDef<Row>[] = [
  { key: 'name', title: '名称', dataIndex: 'name', sortable: true, width: 240 },
  { key: 'price', title: '价格', dataIndex: 'price', sortable: true, align: 'right' },
  { key: 'stock', title: '库存', dataIndex: 'stock', align: 'right' },
];

const batchActions: BatchAction<Row>[] = [
  { key: 'delete', label: '删除', danger: true, onClick: async (rows) => { /* ... */ } },
];

function MyPage() {
  const [query, setQuery] = useState<TableQuery>({ page: 1, pageSize: 20 });
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const { items, total, loading, error } = useMyData(query, search);

  return (
    <DataTable
      items={items}
      total={total}
      loading={loading}
      error={error}
      getRowId={(r) => r.id}
      columns={columns}
      query={query}
      onQueryChange={setQuery}
      selectable
      selectedKeys={selected}
      onSelectionChange={setSelected}
      batchActions={batchActions}
      search={search}
      onSearchChange={setSearch}
      onRowClick={(r) => navigate(`/items/${r.id}`)}
    />
  );
}
```

## 关键设计

- **零数据所有权**:host 自管 `items` / `total` / `loading` / `error`,组件不发请求
- **合并 query 状态**:`{ page, pageSize, sortBy, sortOrder, filters }` 一次性传入,
  排序/翻页都从单一 `onQueryChange` 触发(host 在这里反查后端即可)
- **批量操作 toolbar**:`selectedKeys` 非空时,toolbar 出现 "已选 N 项" + 自定义按钮组
- **搜索受控**:`search` + `onSearchChange` 由 host 管(防抖在 host 侧加)
- **行点击 → onRowClick**:适合"打开详情"场景,与 `selectable` 复选框不冲突
- **错误态**:`error` 非 null 且无数据时显示 `Result` + 重试按钮(可用 `errorState` 自定义)
- **a11y**:antd Table 自带 `aria-` 属性 + 键盘导航

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@dt/data-table` |
| 后端 | (无) |
| 协议 | (无) |

## 何时**不**用

- 卡片网格 / 瀑布流 → `card-flow`
- 左列表右详情(双栏) → `master-detail`
- 树状层级 → `tree-explorer`(待建)
- 看板拖拽 → 不适配
- 巨型数据集(>10k 行)需要虚拟滚动 → 本块基于 antd Table 未做窗口化

## 完整 Props 见 SKILL.md
