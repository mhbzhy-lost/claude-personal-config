---
name: {{SLUG}}-frontend
description: TODO — 替换为对本 block 何时使用的强指令型描述（参考
  blocks/im-conversation-list/frontend/SKILL.md 或
  blocks/commerce-product-list/frontend/SKILL.md 的开头）
---

# `@{{PKG_NS}}/{{SLUG}}`

## 何时使用

TODO：列出**必须**使用本 block 的场景条件（要具体到能让 agent 自检
"我现在的需求是否落在这个列表里"）。

参考 IM 块的写法：
```
凡满足以下任一条件，必须使用本 block 的 <主组件>，禁止自行 ...
- ...
- ...
```

## 何时**不**使用（反向选型）

TODO：列出 agent 容易误用本 block 的场景，明确指向其他方案。

## 安装

```bash
pnpm add file:../../blocks/{{SLUG}}/frontend
```

## 最小用法

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { /* 你的主组件 */ } from '@{{PKG_NS}}/{{SLUG}}';

// TODO: 给一个最小可运行示例（5-10 行内）
```

**重要**：组件依赖 `<App>`（来自 antd）的 message context。

## 完整 API

TODO: 列出主 Props + Config 接口的完整字段表

## 内部已经处理好的事项

TODO: 列出 block 帮你处理的 N 件事——越具体越能让 agent 信服

## 严格禁止的反模式

TODO: 列出 `❌` 项——agent 容易回退去自己写的具体反模式

## 状态

- v0.1 内部用
