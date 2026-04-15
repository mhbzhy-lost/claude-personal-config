---
name: ant-spin
description: "Ant Design Spin 组件文档与用法。用于页面和区块的加载中状态。Use when building React + antd web apps and need to implement Spin."
component: Spin
group: 反馈
applies_to:
  markers_any:
    - "dependency: antd"
---

# Spin（加载中）

> 来源：https://ant.design/components/spin-cn

## 用途

用于页面和区块的加载中状态。

## 何时使用

页面局部处于等待异步数据或正在渲染过程时，合适的加载动效会有效缓解用户的焦虑。

## 基础用法

```tsx
import React from 'react';
import { Spin } from 'antd';

const App: React.FC = () => <Spin />;

export default App;
```

## 关键 API（摘要）

- `delay`：延迟显示加载效果的时间（防止闪烁）
- `description`：可以自定义描述文案
- `fullscreen`：显示带有 `Spin` 组件的背景
- `indicator`：加载指示符
- `percent`：展示进度，当设置 `percent="auto"` 时会预估一个永远不会停止的进度
- `size`：组件大小，可选值为 `small` `medium` `large`

## 组合提示

通常与 `Table`、`Card` 搭配使用。
