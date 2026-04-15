---
name: ant-modal
description: "Ant Design Modal 组件文档与用法。展示一个对话框，提供标题、内容区、操作区。Use when building React + antd web apps and need to implement Modal."
component: Modal
group: 反馈
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Modal（对话框）

> 来源：https://ant.design/components/modal-cn

## 用途

展示一个对话框，提供标题、内容区、操作区。

## 何时使用

需要用户处理事务，又不希望跳转页面以致打断工作流程时，可以使用 `Modal` 在当前页面正中打开一个浮层，承载相应的操作。
另外当需要一个简洁的确认框询问用户时，可以使用 [`App.useApp`](/components/app-cn/) 封装的语法糖方法。

## 基础用法

```tsx
import React, { useState } from 'react';
import { Button, Modal } from 'antd';

const App: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = () => {
    setIsModalOpen(false);
  };

// ...
```

## 关键 API（摘要）

- `cancelButtonProps`：cancel 按钮 props
- `cancelText`：取消按钮文字
- `centered`：垂直居中展示 Modal
- `classNames`：用于自定义 Modal 组件内部各语义化结构的 class，支持对象或函数
- `closable`：是否显示右上角的关闭按钮
- `closeIcon`：自定义关闭图标。5.7.0：设置为 `null` 或 `false` 时隐藏关闭按钮

## 组合提示

通常与 `Button`、`Form` 搭配使用。
