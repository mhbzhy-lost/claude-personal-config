# master-detail SDK

双栏列表 + 详情 (Master Detail) UI chrome SDK——纯前端容器壳，
**自身没有任何业务概念、不发任何请求**。它只做三件事：

1. 响应式布局：宽屏左右双栏 (split)、窄屏栈式切换 (stack)
2. 受控选中：`selectedId` + `onSelect` 由 host 管，组件不存内部 state
3. 通过 render prop 把行渲染与详情渲染交给 host

```
component/
└── frontend/    MasterDetail 组件 + SKILL.md（强指令）
```

## 整体复制

```bash
cp -r blocks/master-detail/component your-project/sdk/ui-chrome/master-detail
```

## 最小用法

```tsx
import { useState } from 'react';
import { MasterDetail } from '@md/master-detail';
import '@md/master-detail/styles.css';

type Row = { id: string; title: string };

const rows: Row[] = [
  { id: '1', title: 'Alice' },
  { id: '2', title: 'Bob' },
];

function Page() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <MasterDetail<Row>
      items={rows}
      getItemId={(r) => r.id}
      selectedId={selected}
      onSelect={setSelected}
      renderItem={(r, isSelected) => (
        <div style={{ padding: 12, fontWeight: isSelected ? 600 : 400 }}>{r.title}</div>
      )}
      renderDetail={(id) => <div style={{ padding: 24 }}>详情：{id}</div>}
      placeholder={<span>选一项看详情</span>}
      emptyList={<span>暂无数据</span>}
      renderBackButton={(onBack) => (
        <button onClick={onBack} style={{ padding: '8px 12px' }}>‹ 返回</button>
      )}
    />
  );
}
```

## 关键设计

- **零数据所有权**：组件不知道 `items` 怎么来；host 自己拉取、分页、搜索、缓存
- **受控选中**：`selectedId` 是单一事实源；window 多开 / 路由 hash / 持久化都由 host 接管
- **响应式三档** `layout='auto' | 'split' | 'stack'`：
  - `auto`（默认）：viewport ≥ `splitBreakpoint`(默认 768) → split，否则 stack
  - `split`：永远双栏，窄屏会变成两边都很挤
  - `stack`：永远栈式，宽屏也不展开
- **a11y 默认**：`role="listbox"` + `role="option"` + `aria-selected` + 键盘 Enter/Space 选中
- **样式覆盖友好**：所有元素带 BEM 类名 `md-master-detail__*`，host 用普通 CSS 覆盖即可
- **可选主题桥**：选中行底色读 `--ant-color-primary-bg` CSS var，host 用 antd `theme.useToken()` 把 token 注入到任意祖先元素即可联动主题

## 完整 Props 见 SKILL.md

`component/frontend/SKILL.md` 列了所有 Props 字段表 + 严格反模式禁令。

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@md/master-detail` |
| 后端 | （无） |
| 协议 | （无） |

## 何时**不**用

- **只需要一个列表，不需要详情** → 直接用 antd `List` / `Table` 或 `commerce-product-list`
- **详情是路由独立页面，不需要同屏并列** → host 自管两个 Route，不用本块
- **嵌入式 widget**（详情是悬浮卡片 / 抽屉） → 直接 `Drawer` / `Popover`
- **数据强绑定后端状态机**（例如订单流转）→ 继续用 `order-detail` 那种带后端的 block，本块只是其同屏布局的下层壳
- **三栏 IDE 风格**（list / detail / sub-detail） → 多层 split panel，本块不适配
