---
name: ant-popconfirm
description: "Ant Design Popconfirm 组件文档与用法。点击元素，弹出气泡式的确认框。"
tech_stack: [antd, react, frontend]
language: [typescript]
---

# Popconfirm（气泡确认框）

> 来源：https://ant.design/components/popconfirm-cn

## 用途

点击元素，弹出气泡式的确认框。

## 何时使用

目标元素的操作需要用户进一步的确认时，在目标元素附近弹出浮层提示，询问用户。
和 `confirm` 弹出的全屏居中模态对话框相比，交互形式更轻量。

## 基础用法

```tsx
import React from 'react';
import type { PopconfirmProps } from 'antd';
import { Button, message, Popconfirm } from 'antd';

const App: React.FC = () => {
  const [messageApi, holder] = message.useMessage();

  const confirm: PopconfirmProps['onConfirm'] = (e) => {
    console.log(e);
    messageApi.success('Click on Yes');
  };

  const cancel: PopconfirmProps['onCancel'] = (e) => {
    console.log(e);
// ...
```

## 关键 API（摘要）

- `cancelText`：取消按钮文字
- `disabled`：阻止点击 Popconfirm 子元素时弹出确认框
- `icon`：自定义弹出气泡 Icon 图标
- `okButtonProps`：ok 按钮 props
- `okText`：确认按钮文字
- `okType`：确认按钮类型

## 组合提示

通常与 `Button`、`Table` 搭配使用。
