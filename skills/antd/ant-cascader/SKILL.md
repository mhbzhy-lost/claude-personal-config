---
name: ant-cascader
description: "Ant Design Cascader 组件文档与用法。- 需要从一组相关联的数据集合进行选择，例如省市区，公司层级，事物分类等。 - 从一个较大的数据集合中进行选择时，用多级分类进行分隔，方便选择。 - 比起 Select 组件，可以在同一个浮层中完成选择，有较好的体验。"
tech_stack: [antd]
---

# Cascader（级联选择）

> 来源：https://ant.design/components/cascader-cn

## 用途

级联选择框。

## 何时使用

- 需要从一组相关联的数据集合进行选择，例如省市区，公司层级，事物分类等。
- 从一个较大的数据集合中进行选择时，用多级分类进行分隔，方便选择。
- 比起 Select 组件，可以在同一个浮层中完成选择，有较好的体验。

## 基础用法

```tsx
import React from 'react';
import type { CascaderProps } from 'antd';
import { Cascader } from 'antd';
import type { HTMLAriaDataAttributes } from 'antd/es/_util/aria-data-attrs';

type Option = {
  value: string;
  label: string;
  children?: Option[];
} & HTMLAriaDataAttributes;

const options: Option[] = [
  {
    value: 'zhejiang',
// ...
```

## 关键 API（摘要）

- `autoClearSearchValue`：是否在选中项后清空搜索框，只在 `multiple` 为 `true` 时有效
- `changeOnSelect`：单选时生效（multiple 下始终都可以选择），点选每级菜单选项值都会发生变化。
- `className`：自定义类名
- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `defaultOpen`：是否默认展示浮层
- `defaultValue`：默认的选中项

## 组合提示

通常与 `Form`、`Select` 搭配使用。
