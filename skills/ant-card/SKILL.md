---
name: ant-card
description: "Ant Design Card 组件文档与用法。最基础的卡片容器，可承载文字、列表、图片、段落，常用于后台概览页面。Use when building React + antd web apps and need to implement Card."
component: Card
group: 数据展示
applies_to:
  markers_any:
    - "dependency: antd"
---

# Card（卡片）

> 来源：https://ant.design/components/card-cn

## 用途

通用卡片容器。

## 何时使用

最基础的卡片容器，可承载文字、列表、图片、段落，常用于后台概览页面。

## 基础用法

```tsx
import React from 'react';
import { Card, Space } from 'antd';

const App: React.FC = () => (
  <Space vertical size={16}>
    <Card title="Default size card" extra={<a href="#">More</a>} style={{ width: 300 }}>
      <p>Card content</p>
      <p>Card content</p>
      <p>Card content</p>
    </Card>
    <Card size="small" title="Small size card" extra={<a href="#">More</a>} style={{ width: 300 }}>
      <p>Card content</p>
      <p>Card content</p>
      <p>Card content</p>
// ...
```

## 关键 API（摘要）

- `activeTabKey`：当前激活页签的 key
- `bordered`：是否有边框, 请使用 `variant` 替换
- `variant`：形态变体
- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `cover`：卡片封面
- `defaultActiveTabKey`：初始化选中页签的 key，如果没有设置 activeTabKey

## 组合提示

通常与 `Grid`、`Space` 搭配使用。
