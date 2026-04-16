---
name: ant-list
description: "Ant Design List 组件文档与用法。最基础的列表展示，可承载文字、列表、图片、段落。"
tech_stack: [antd, react, frontend]
language: [typescript]
---

# List（列表）

> 来源：https://ant.design/components/list-cn

## 用途

最基础的列表展示，可承载文字、列表、图片、段落。

## 何时使用

最基础的列表展示，可承载文字、列表、图片、段落，常用于后台数据展示页面。
<!-- prettier-ignore -->
:::warning{title=废弃提示}
List 组件已经进入废弃阶段，将于下个 major 版本移除。
:::

## 基础用法

```tsx
import React from 'react';
import { Avatar, List } from 'antd';

const data = [
  {
    title: 'Ant Design Title 1',
  },
  {
    title: 'Ant Design Title 2',
  },
  {
    title: 'Ant Design Title 3',
  },
  {
// ...
```

## 组合提示

通常与 `Pagination`、`Skeleton` 搭配使用。
