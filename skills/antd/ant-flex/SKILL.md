---
name: ant-flex
description: "Ant Design Flex 组件文档与用法。用于对齐的弹性布局容器。Use when building React + antd web apps and need to implement Flex."
component: Flex
group: 布局
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Flex（弹性布局）

> 来源：https://ant.design/components/flex-cn

## 用途

用于对齐的弹性布局容器。

## 何时使用

- 适合设置元素之间的间距。
- 适合设置各种水平、垂直对齐方式。

## 基础用法

```tsx
/* eslint-disable react/no-array-index-key */
import React from 'react';
import { Flex, Radio } from 'antd';

const baseStyle: React.CSSProperties = {
  width: '25%',
  height: 54,
};

const App: React.FC = () => {
  const [value, setValue] = React.useState<string>('horizontal');
  return (
    <Flex gap="medium" vertical>
      <Radio.Group value={value} onChange={(e) => setValue(e.target.value)}>
// ...
```

## 关键 API（摘要）

- `wrap`：设置元素单行显示还是多行显示
- `justify`：设置元素在主轴方向上的对齐方式
- `align`：设置元素在交叉轴方向上的对齐方式
- `flex`：flex CSS 简写属性
- `gap`：设置网格之间的间隙
- `component`：自定义元素类型

## 组合提示

通常与 `Space`、`Grid` 搭配使用。
