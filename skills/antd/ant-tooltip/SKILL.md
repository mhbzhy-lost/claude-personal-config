---
name: ant-tooltip
description: "Ant Design Tooltip 组件文档与用法。简单的文字提示气泡框。"
tech_stack: [antd, react, frontend]
language: [typescript]
capability: [ui-overlay]
---

# Tooltip（文字提示）

> 来源：https://ant.design/components/tooltip-cn

## 用途

简单的文字提示气泡框。

## 何时使用

鼠标移入则显示提示，移出消失，气泡浮层不承载复杂文本和操作。
可用来代替系统默认的 `title` 提示，提供一个 `按钮/文字/操作` 的文案解释。

## 基础用法

```tsx
import React from 'react';
import { Tooltip } from 'antd';

const App: React.FC = () => (
  <Tooltip title="prompt text">
    <span>Tooltip will show on mouse enter.</span>
  </Tooltip>
);

export default App;
```

## 关键 API（摘要）

- `color`：设置背景颜色，使用该属性后内部文字颜色将自适应
- `classNames`：语义化结构 class
- `styles`：语义化结构 style

## 组合提示

通常与 `Button`、`Icon` 搭配使用。
