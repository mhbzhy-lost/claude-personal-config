---
name: ant-segmented
description: "Ant Design Segmented 组件文档与用法。用于展示多个选项并允许用户选择其中单个选项。Use when building React + antd web apps and need to implement Segmented."
component: Segmented
group: 数据展示
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Segmented（分段控制器）

> 来源：https://ant.design/components/segmented-cn

## 用途

用于展示多个选项并允许用户选择其中单个选项。

## 何时使用

- 用于展示多个选项并允许用户选择其中单个选项；
- 当切换选中选项时，关联区域的内容会发生变化。

## 基础用法

```tsx
import React from 'react';
import { Segmented } from 'antd';

const Demo: React.FC = () => (
  <Segmented<string>
    options={['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly']}
    onChange={(value) => {
      console.log(value); // string
    }}
  />
);

export default Demo;
```

## 组合提示

通常与 `Tabs`、`Radio` 搭配使用。
