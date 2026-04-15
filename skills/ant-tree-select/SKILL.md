---
name: ant-tree-select
description: "Ant Design TreeSelect 组件文档与用法。类似 Select 的选择控件，可选择的数据结构是一个树形结构时，可以使用 TreeSelect，例如公司层级、学科系统、分类目录等等。Use when building React + antd web apps and need to implement TreeSelect."
component: TreeSelect
group: 数据录入
applies_to:
  markers_any:
    - "dependency: antd"
---

# TreeSelect（树选择）

> 来源：https://ant.design/components/tree-select-cn

## 用途

树型选择控件。

## 何时使用

类似 Select 的选择控件，可选择的数据结构是一个树形结构时，可以使用 TreeSelect，例如公司层级、学科系统、分类目录等等。

## 基础用法

```tsx
import React, { useState } from 'react';
import { TreeSelect } from 'antd';
import type { TreeSelectProps } from 'antd';

const treeData = [
  {
    value: 'parent 1',
    title: 'parent 1',
    children: [
      {
        value: 'parent 1-0',
        title: 'parent 1-0',
        children: [
          {
// ...
```

## 组合提示

通常与 `Tree`、`Select` 搭配使用。
