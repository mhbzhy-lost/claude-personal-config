---
name: ant-app
description: "Ant Design App 组件文档与用法。提供重置样式和提供消费上下文的默认环境。"
tech_stack: [antd]
language: [typescript]
---

# App（包裹组件）

> 来源：https://ant.design/components/app-cn

## 用途

提供重置样式和提供消费上下文的默认环境。

## 何时使用

- 提供可消费 React context 的 `message.xxx`、`Modal.xxx`、`notification.xxx` 的静态方法，可以简化 useMessage 等方法需要手动植入 `contextHolder` 的问题。
- 提供基于 `.ant-app` 的默认重置样式，解决原生元素没有 antd 规范样式的问题。

## 基础用法

```tsx
import React from 'react';
import { App, Button, Space } from 'antd';

// Sub page
const Page: React.FC = () => {
  const { message, modal, notification } = App.useApp();

  const showMessage = () => {
    message.success('Success!');
  };

  const showModal = () => {
    modal.warning({
      title: 'This is a warning message',
// ...
```

## 组合提示

通常与 `Modal`、`Message`、`Notification` 搭配使用。
