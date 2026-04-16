---
name: ant-float-button
description: "Ant Design FloatButton 组件文档与用法。悬浮于页面上方的按钮。"
tech_stack: [antd]
language: [typescript]
---

# FloatButton（悬浮按钮）

> 来源：https://ant.design/components/float-button-cn

## 用途

悬浮于页面上方的按钮。

## 何时使用

- 用于网站上的全局功能；
- 无论浏览到何处都可以看见的按钮。

## 基础用法

```tsx
import React from 'react';
import { FloatButton } from 'antd';

const App: React.FC = () => <FloatButton onClick={() => console.log('onClick')} />;

export default App;
```

## 组合提示

通常与 `Layout`、`BackTop` 搭配使用。
