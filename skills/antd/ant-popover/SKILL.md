---
name: ant-popover
description: "Ant Design Popover 组件文档与用法。点击/鼠标移入元素，弹出气泡式的卡片浮层。Use when building React + antd web apps and need to implement Popover."
tech_stack: [antd]
---

# Popover（气泡卡片）

> 来源：https://ant.design/components/popover-cn

## 用途

点击/鼠标移入元素，弹出气泡式的卡片浮层。

## 何时使用

当目标元素有进一步的描述和相关操作时，可以收纳到卡片中，根据用户的操作行为进行展现。
和 `Tooltip` 的区别是，用户可以对浮层上的元素进行操作，因此它可以承载更复杂的内容，比如链接或按钮等。

## 基础用法

```tsx
import React from 'react';
import { Button, Popover } from 'antd';

const content = (
  <div>
    <p>Content</p>
    <p>Content</p>
  </div>
);

const App: React.FC = () => (
  <Popover content={content} title="Title">
    <Button type="primary">Hover me</Button>
  </Popover>
// ...
```

## 关键 API（摘要）

- `content`：卡片内容
- `title`：卡片标题
- `styles`：用于自定义组件内部各语义化结构的行内 style，支持对象或函数

## 组合提示

通常与 `Button`、`Tooltip` 搭配使用。
