# omnibox SDK

全局搜索 / 命令面板 UI chrome,**两种模式同一份代码**:

- **`modal`** — 全屏弹窗,Cmd/Ctrl+K 打开(类似 VSCode / Linear / Notion 的命令面板)
- **`inline`** — 头部输入框 + 下拉(类似 GitHub / Slack 的搜索框)

都共享同一个 `OmniboxPanel`:分类结果 + 键盘 ↑↓/Enter 导航 + 默认状态。

```
component/
└── frontend/    Omnibox 组件(双模式) + OmniboxPanel + useHotkey + SKILL.md
```

## 整体复制

```bash
cp -r blocks/omnibox/component your-project/sdk/ui-chrome/omnibox
```

## 最小用法 — modal 模式(Cmd-K)

```tsx
import { useState, useMemo } from 'react';
import { Omnibox } from '@ob/omnibox';
import type { SearchGroup } from '@ob/omnibox';
import '@ob/omnibox/styles.css';

function App() {
  const [q, setQ] = useState('');
  const groups: SearchGroup[] = useMemo(() => [
    {
      key: 'pages',
      title: '页面',
      items: [
        { key: 'home', label: '首页', onSelect: () => router.push('/') },
        { key: 'tasks', label: '任务', onSelect: () => router.push('/tasks') },
      ].filter((it) => String(it.label).toLowerCase().includes(q.toLowerCase())),
    },
    {
      key: 'actions',
      title: '命令',
      items: [
        { key: 'new-task', label: '新建任务', hint: 'N', onSelect: () => createTask() },
      ],
    },
  ], [q]);

  return (
    <Omnibox
      mode="modal"
      query={q}
      onQueryChange={setQ}
      groups={groups}
      // hotkey 默认 'mod+k';open 默认内部维护,Cmd/Ctrl+K 触发
    />
  );
}
```

## 最小用法 — inline 模式(头部搜索)

```tsx
<Omnibox
  mode="inline"
  query={q}
  onQueryChange={setQ}
  groups={searchResults}
  inlineWidth={360}
  placeholder="搜索任务、项目、人员…"
  defaultGroup={{ key: 'recent', title: '最近', items: recents }}
/>
```

## 关键设计

- **零数据所有权**:host 给 `groups`(自己做 fuzzy / 异步 fetch);组件只做渲染 + 键盘
- **双模式同 Panel**:`mode` 切换包装层(Modal vs Dropdown),核心面板逻辑一致
- **默认状态**:`query` 为空时显示 `defaultGroup`(常见:"Recent" / "Trending")
- **键盘**:↑↓ 选中、Enter 触发、Esc(modal)关闭
- **热键**:modal 模式默认 `mod+k`(Mac=Cmd,其它=Ctrl);可改也可关
- **a11y**:`role="combobox" + aria-controls + aria-expanded`,结果列表 `role="listbox"`,每行 `role="option" + aria-selected`

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@ob/omnibox` |
| 后端 | (无) |
| 协议 | (无) |

## 何时**不**用

- 简单单选下拉 → antd `Select`
- 纯自动补全(单一类型结果) → antd `AutoComplete`
- 页面内字段筛选 → antd `Input` + onChange
- 巨型结果集(>1k 行)需要虚拟滚动 → 本块未做
- 多步表单向导 → 找 wizard / modal-flow

## 完整 Props 见 SKILL.md
