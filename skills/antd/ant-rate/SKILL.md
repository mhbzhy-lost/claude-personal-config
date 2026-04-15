---
name: ant-rate
description: "Ant Design Rate 组件文档与用法。用于对事物进行评分操作。Use when building React + antd web apps and need to implement Rate."
component: Rate
group: 数据录入
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Rate（评分）

> 来源：https://ant.design/components/rate-cn

## 用途

用于对事物进行评分操作。

## 何时使用

- 对评价进行展示。
- 对事物进行快速的评级操作。

## 基础用法

```tsx
import React from 'react';
import { Rate } from 'antd';

const App: React.FC = () => <Rate />;

export default App;
```

## 关键 API（摘要）

- `allowHalf`：是否允许半选
- `character`：自定义字符
- `className`：自定义样式类名
- `count`：star 总数
- `defaultValue`：默认值
- `disabled`：只读，无法进行交互
