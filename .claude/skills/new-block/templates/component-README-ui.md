# {{SLUG}} SDK

{{TITLE_CN}}（{{TITLE_EN}}）UI chrome SDK——纯前端，无后端、无协议层。

> 🚧 占位骨架。

```
component/
└── frontend/    {{TITLE_EN}} 组件 + SKILL.md
```

## 整体复制

```bash
cp -r blocks/{{SLUG}}/component your-project/sdk/ui-chrome/{{SLUG}}
```

## 用法

```tsx
import { ConfigProvider } from 'antd';
// TODO: import block component
// import { <Main> } from '@{{PKG_NS}}/{{SLUG}}';
// import '@{{PKG_NS}}/{{SLUG}}/styles.css';

<ConfigProvider>
  {/* TODO */}
</ConfigProvider>
```

## 关键设计

TODO：列出消费者需要知道的核心约束。

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@{{PKG_NS}}/{{SLUG}}` |
| 后端 | （无） |

## 何时**不**用

TODO：反向选型。
