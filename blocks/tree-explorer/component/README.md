# tree-explorer SDK

file-explorer 形态的树形浏览器。基于 antd `<Tree>`,补齐 antd 不给的
file-explorer 交互:**search 联动 + 右键菜单 + 双击 open + 路径回调 +
展开状态持久化**。

```
component/
└── frontend/    TreeExplorer + usePersistedExpansion + utils + SKILL.md
```

## 整体复制

```bash
cp -r blocks/tree-explorer/component your-project/sdk/ui-chrome/tree-explorer
```

## 最小用法

```tsx
import { useState } from 'react';
import { TreeExplorer } from '@te/tree-explorer';
import type { TreeNode, ContextMenuItem } from '@te/tree-explorer';
import '@te/tree-explorer/styles.css';

const data: TreeNode[] = [
  {
    id: 'src',
    label: 'src',
    kind: 'folder',
    children: [
      { id: 'src/index.ts', label: 'index.ts', kind: 'file' },
      { id: 'src/App.tsx', label: 'App.tsx', kind: 'file' },
      {
        id: 'src/components',
        label: 'components',
        kind: 'folder',
        children: [{ id: 'src/components/Button.tsx', label: 'Button.tsx' }],
      },
    ],
  },
];

const contextMenu: ContextMenuItem[] = [
  { key: 'rename', label: '重命名', onClick: (n) => renameNode(n) },
  { key: 'delete', label: '删除', danger: true, onClick: (n) => deleteNode(n) },
];

function Page() {
  const [selected, setSelected] = useState<string | undefined>();
  const [search, setSearch] = useState('');

  return (
    <TreeExplorer
      data={data}
      selectedId={selected}
      onSelect={(node, path) => {
        setSelected(node.id);
        console.log('breadcrumb:', path.map((p) => p.label));
      }}
      onOpen={(node) => openInEditor(node.id)}
      search={search}
      onSearchChange={setSearch}
      contextMenu={contextMenu}
      persistKey="myproj.tree.expanded"
    />
  );
}
```

## 关键设计

- **TreeNode schema**:`{ id, label, icon?, children?, kind?, disabled?, searchText? }`;`kind` 缺省时 `children !== undefined` 即为 folder
- **`onSelect(node, path)`**:回调附带 ancestor chain,host 可直接驱动 breadcrumb 而不用再遍历树
- **`onOpen(node, path)`**:双击触发(典型"打开文件"语义);省略时双击 = 无操作
- **search 联动**:输入关键词 → 匹配节点 yellow 高亮 + 自动展开**全部祖先**(union 到当前 expandedKeys);搜索空字符串恢复手动展开
- **展开持久化**:默认 `persistKey` localStorage 自管;受控用 `expandedKeys + onExpandedChange`
- **右键菜单 schema**:`ContextMenuItem[]` 含 `disabled(node) / visible(node) / danger` 钩子,host 不写 antd Dropdown 拼装
- **a11y**:antd Tree 自带键盘导航(箭头/Enter);items 高亮符合 selected 视觉

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@te/tree-explorer` |
| 后端 | (无,host 自管数据) |
| 协议 | (无,host 自定 TreeNode schema) |

## 何时**不**用

- 扁平列表(无层级) → `data-table` 或 `card-flow`
- 组织架构 + KPI 卡片 → 找 org-chart 方案
- 拖拽 reparent / drag-to-reorder → 本块 v0.1 未实现
- 异步懒加载大型项目 → 本块需要 host 自己异步替换 data(没抽象 loader 接口)

## 完整 Props 见 SKILL.md
