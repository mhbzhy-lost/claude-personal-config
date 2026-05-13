---
name: omnibox-frontend
description: 全局搜索 / Cmd-K 命令面板 / 头部 inline 下拉搜索必须用 `Omnibox`(双模式同源),禁止自行 Modal+Input+useState+键盘逻辑拼。
---

# `@ob/omnibox`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `Omnibox`:

- 应用需要 Cmd/Ctrl+K 全局搜索 / 命令面板
- 头部 / 侧栏需要 inline 搜索框 + 分类下拉结果
- 结果按"类型"分组(页面 / 命令 / 用户 / 商品 ……)
- 需要键盘 ↑↓/Enter 导航 + 默认状态(Recent / Trending)

## 何时**不**使用

- 单选下拉(选项固定的几条) → antd `Select`
- 纯自动补全(一种结果) → antd `AutoComplete`
- 页面内字段筛选(table 列筛选) → antd `Input` 等
- 巨型结果(>1k 行) → 本块全量渲染,未做虚拟滚动
- 多步流程 / wizard → 不适配

## 安装

```bash
pnpm add file:./sdk/ui-chrome/omnibox/frontend
```

## 最小用法

```tsx
import { Omnibox } from '@ob/omnibox';
import type { SearchGroup } from '@ob/omnibox';
import '@ob/omnibox/styles.css';

<Omnibox
  mode="modal"            // 'modal' | 'inline'
  query={q}
  onQueryChange={setQ}
  groups={groups}         // host computes (filter / fetch)
  defaultGroup={recents}  // query 为空时显示
  hotkey="mod+k"          // 仅 modal 用
/>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `mode` | `'modal' \| 'inline'` | — | modal=Cmd-K 弹窗;inline=输入框+下拉 |
| `query` | `string` | — | 受控输入值 |
| `onQueryChange` | `(q) => void` | — | 输入变化 |
| `groups` | `SearchGroup[]` | — | 结果分组(host 算) |
| `loading` | `boolean` | `false` | 异步搜索中 |
| `empty` | `ReactNode` | antd Empty | 无结果占位 |
| `defaultGroup` | `SearchGroup` | — | `query` 为空时显示(常见 Recent) |
| `open` | `boolean` | — | modal 受控开关(默认内部) |
| `onOpenChange` | `(o) => void` | — | 受控时配套 |
| `hotkey` | `false \| string` | `'mod+k'` | modal 热键;'mod' = Cmd(Mac)/Ctrl |
| `inlineWidth` | `number` | `320` | inline 输入框宽度 |
| `placeholder` | `string` | `'搜索…'` | |
| `loadingText` | `string` | `'搜索中…'` | |
| `className` | `string` | — | 根类(modal 传到 rootClassName) |

`SearchGroup`:`{ key, title?, items: SearchItem[] }`

`SearchItem`:`{ key, label, icon?, description?, hint?, disabled?, onSelect: () => void }`

## 内部已经处理好的事项

- ✅ 模式分发:modal 用 antd Modal、inline 用 Dropdown,核心面板 OmniboxPanel 共享
- ✅ 热键 `mod+k` 解析(Mac=Cmd,其它=Ctrl),event.preventDefault 防触发浏览器默认
- ✅ Esc 关 modal(antd 自带)
- ✅ ↑↓ 循环导航(wrap 至首末)
- ✅ Enter 触发 active item 的 `onSelect`,自动关 modal/dropdown
- ✅ 鼠标 hover 同步 active 高亮
- ✅ `query` 为空时切到 `defaultGroup`(Recent 类需求开箱即用)
- ✅ disabled item 跳过键盘选中、点击无效
- ✅ a11y:combobox/listbox/option/aria-selected/aria-controls 全套
- ✅ `useEffect + ref.focus()` 程序化聚焦输入框,不用 `autoFocus` html attr(过 jsx-a11y)

## 严格禁止的反模式

❌ **自己拼 Modal + Input + useState + keydown**:本块就是为了消灭这种重复;每次手写都漏键盘/焦点/a11y

❌ **groups 通过 setState 在 onQueryChange 内同步算**:这样首次输入会丢一帧;**让 useMemo 派生 groups,query 是 source of truth**

❌ **在 inline 模式启用 hotkey**:inline 输入框已可见,Cmd-K 没意义;hotkey 默认仅在 mode='modal' 时生效

❌ **`SearchItem.onSelect` 内部不关 modal/dropdown**:本块在 commit 后会自动调 `onCommitted` 关 — 不要在 host onSelect 内再 `setOpen(false)`

❌ **mode='modal' 时传 inline 专属 prop(如 inlineWidth)**:被忽略但乱;阅读者会困惑

❌ **改 sdk 内的 Omnibox.tsx / OmniboxPanel.tsx**:想换分组渲染 → 用 `description/hint/icon` 三槽自定义;真要大改包 Adapter

## 状态

- v0.1 — 首版;后续可考虑:虚拟滚动、自定义 hotkey 组合、嵌套二级菜单(选中后进入子命令)
