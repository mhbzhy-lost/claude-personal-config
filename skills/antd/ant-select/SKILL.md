---
name: ant-select
description: "Ant Design Select 组件文档与用法。- 弹出一个下拉菜单给用户选择操作，用于代替原生的选择器，或者需要一个更优雅的多选器时。 - 当选项少时（少于 5 项），建议直接将选项平铺，使用 Radio 是更好的选择。 - 如果你在寻找一个可输可选的输入框，那你可能需要 AutoComplete。Use when building React + antd web apps and need to implement Select."
tech_stack: [antd]
---

# Select（选择器）

> 来源：https://ant.design/components/select-cn

## 用途

下拉选择器。

## 何时使用

- 弹出一个下拉菜单给用户选择操作，用于代替原生的选择器，或者需要一个更优雅的多选器时。
- 当选项少时（少于 5 项），建议直接将选项平铺，使用 [Radio](/components/radio-cn/) 是更好的选择。
- 如果你在寻找一个可输可选的输入框，那你可能需要 [AutoComplete](/components/auto-complete-cn/)。

## 基础用法

```tsx
import React from 'react';
import { Select, Space } from 'antd';

const handleChange = (value: string) => {
  console.log(`selected ${value}`);
};

const App: React.FC = () => (
  <Space wrap>
    <Select
      defaultValue="lucy"
      style={{ width: 120 }}
      onChange={handleChange}
      options={[
// ...
```

## 组合提示

通常与 `Form`、`TreeSelect` 搭配使用。
