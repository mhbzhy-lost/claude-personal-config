---
name: ant-divider
description: "Ant Design Divider 组件文档与用法。- 对不同章节的文本段落进行分割。 - 对行内文字/链接进行分割，例如表格的操作列。Use when building React + antd web apps and need to implement Divider."
component: Divider
group: 布局
applies_to:
  markers_any:
    - "dependency: antd"
---

# Divider（分割线）

> 来源：https://ant.design/components/divider-cn

## 用途

区隔内容的分割线。

## 何时使用

- 对不同章节的文本段落进行分割。
- 对行内文字/链接进行分割，例如表格的操作列。

## 基础用法

```tsx
import React from 'react';
import { ConfigProvider, Divider } from 'antd';

const App: React.FC = () => (
  <ConfigProvider
    theme={{
      token: {
        margin: 24,
        marginLG: 48,
        lineWidth: 5,
        colorSplit: '#1677ff',
      },
      components: {
        Divider: {
// ...
```

## 关键 API（摘要）

- `className`：分割线样式类
- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `dashed`：是否虚线
- `orientation`：水平或垂直类型
- `orientationMargin`：标题和最近 left/right 边框之间的距离，去除了分割线，同时 `titlePlacement` 不能为 `…
- `plain`：文字是否显示为普通正文样式
