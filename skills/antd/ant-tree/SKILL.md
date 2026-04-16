---
name: ant-tree
description: "Ant Design Tree 组件文档与用法。文件夹、组织架构、生物分类、国家地区等等，世间万物的大多数结构都是树形结构。使用 树控件 可以完整展现其中的层级关系，并具有展开收起选择等交互功能。"
tech_stack: [antd, react, frontend]
language: [typescript]
---

# Tree（树形控件）

> 来源：https://ant.design/components/tree-cn

## 用途

多层次的结构列表。

## 何时使用

文件夹、组织架构、生物分类、国家地区等等，世间万物的大多数结构都是树形结构。使用 `树控件` 可以完整展现其中的层级关系，并具有展开收起选择等交互功能。

## 基础用法

```tsx
import React from 'react';
import { Tree } from 'antd';
import type { TreeDataNode, TreeProps } from 'antd';

const treeData: TreeDataNode[] = [
  {
    title: 'parent 1',
    key: '0-0',
    children: [
      {
        title: 'parent 1-0',
        key: '0-0-0',
        disabled: true,
        children: [
// ...
```

## 组合提示

通常与 `TreeSelect`、`Checkbox` 搭配使用。
