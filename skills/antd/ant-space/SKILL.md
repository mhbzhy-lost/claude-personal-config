---
name: ant-space
description: "Ant Design Space 组件文档与用法。设置组件之间的间距。"
tech_stack: [antd]
---

# Space（间距）

> 来源：https://ant.design/components/space-cn

## 用途

设置组件之间的间距。

## 何时使用

避免组件紧贴在一起，拉开统一的空间。
- 适合行内元素的水平间距。
- 可以设置各种水平对齐方式。
- 需要表单组件之间紧凑连接且合并边框时，使用 Space.Compact（自 `antd@4.24.0` 版本开始提供该组件）。

## 基础用法

```tsx
import React from 'react';
import { Button, Space } from 'antd';

const App: React.FC = () => (
  <div className="space-align-container">
    <div className="space-align-block">
      <Space align="center">
        center
        <Button type="primary">Primary</Button>
        <span className="mock-block">Block</span>
      </Space>
    </div>
    <div className="space-align-block">
      <Space align="start">
// ...
```
