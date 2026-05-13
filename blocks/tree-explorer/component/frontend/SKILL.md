---
name: tree-explorer-frontend
description: file-explorer 形态的树形浏览(文件夹+文件 + search 联动 + 右键菜单 + 双击 open)必须用 `TreeExplorer`,禁止自行 antd Tree + useState 拼联动逻辑。
---

# `@te/tree-explorer`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `TreeExplorer`:

- 文件管理器 / IDE 项目树 / 文档库 / 资源管理器
- 组织架构 / 分类目录(可层级展开)
- 需要 search 关键字联动 + 自动展开父节点
- 需要右键菜单(重命名 / 删除 / 复制路径等)
- 需要 双击打开 / 单击选中 区分

## 何时**不**使用

- 扁平列表(无层级) → `data-table` 或 `card-flow`
- 组织架构带 KPI 卡 → org-chart 类方案
- 巨型懒加载项目树(需要异步加载子节点)→ 本块要求 data 全量(可由 host 替换)
- 想要拖拽 reparent → 本块 v0.1 未实现

## 安装

```bash
pnpm add file:./sdk/ui-chrome/tree-explorer/frontend
```

## 最小用法

```tsx
import { TreeExplorer } from '@te/tree-explorer';
import '@te/tree-explorer/styles.css';

<TreeExplorer
  data={data}
  selectedId={selected}
  onSelect={(node, path) => setSelected(node.id)}
  onOpen={(node) => openInEditor(node.id)}
  search={q}
  onSearchChange={setQ}
  contextMenu={[
    { key: 'rename', label: '重命名', onClick: (n) => rename(n) },
    { key: 'delete', label: '删除', danger: true, onClick: (n) => del(n) },
  ]}
  persistKey="proj.tree.expanded"
/>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `data` | `TreeNode[]` | — | 顶层节点 |
| `selectedId` | `string` | — | 受控选中 id |
| `onSelect` | `(node, path) => void` | — | 单击选中 + 祖先链 |
| `onOpen` | `(node, path) => void` | — | 双击打开(省略则双击无操作) |
| `expandedKeys` | `string[]` | — | 受控展开 |
| `onExpandedChange` | `(keys) => void` | — | 受控时配套 |
| `persistKey` | `string` | — | localStorage 持久化展开 |
| `defaultExpandedKeys` | `string[]` | `[]` | 首次挂载默认 |
| `search` | `string` | — | 受控搜索 |
| `onSearchChange` | `(q) => void` | — | 搜索变化 |
| `searchPlaceholder` | `string` | `'搜索…'` | |
| `contextMenu` | `ContextMenuItem[]` | — | 右键菜单(省略则无) |
| `toolbar` | `ReactNode` | — | 搜索框右侧的工具按钮(新建/刷新) |
| `emptyState` | `ReactNode` | antd Empty | data 为空 |
| `ariaLabel` | `string` | `'树形浏览器'` | |
| `className` | `string` | — | 根类 |
| `height` | `string \| number` | `'100%'` | 根高 |

`TreeNode`:`{ id, label, icon?, children?, kind?: 'folder'\|'file', disabled?, searchText? }`

`ContextMenuItem`:`{ key, label, icon?, danger?, disabled?(n), visible?(n), onClick(n) }`

## 内部已经处理好的事项

- ✅ kind 自动推断:`children !== undefined` → folder,否则 file
- ✅ 默认 folder / file 图标(可被 `node.icon` 覆盖)
- ✅ search 联动:匹配节点 yellow 高亮 + 自动展开祖先(union 而不替换手动展开)
- ✅ search 清空后:回到手动展开状态(不丢)
- ✅ 展开 localStorage 持久化(JSON 数组)+ 反序列化容错
- ✅ 右键菜单:antd Dropdown trigger=contextMenu + visible/disabled per-node 过滤
- ✅ `onSelect` 自带 ancestor path(host 直接拼 breadcrumb)
- ✅ `onOpen` 区分于 `onSelect`(典型 IDE 单击选中 / 双击打开)
- ✅ antd Tree 自带键盘导航(↑↓/Enter/方向展开)
- ✅ `searchText` 字段允许 host 加别名 / pinyin 等

## 严格禁止的反模式

❌ **自己拼 antd Tree + useState search filter**:本块就是为了消灭这种联动复杂度

❌ **expandedKeys 与 persistKey 同时给**:受控覆盖持久化,以受控为准(persistKey 被忽略);二选一

❌ **search 关键字时还期望"只显示匹配项"**:本块**保留全树结构 + 高亮匹配**,不过滤(避免上下文丢失);如真要过滤,host 自己派生 `data`

❌ **想用本块做"checkbox 多选"**:本块未暴露 checkable,不适配多选场景(找 antd Tree 的 checkable=true)

❌ **依赖默认右键菜单展示位置**:antd Dropdown 自动定位,但移动端 long-press 没接;移动场景 host 自己加 swipe-action

❌ **改 sdk 内部组件**:想加 column / 头部排序 → 那不是 tree,是 `data-table`

## 状态

- v0.1 — 首版;后续可考虑:拖拽 reparent、异步 loader、checkable 多选、pinyin / fuzzy match、虚拟滚动
