---
name: ant-table
description: "Ant Design Table 组件文档与用法。- 当有大量结构化的数据需要展现时； - 当需要对数据进行排序、搜索、分页、自定义操作等复杂行为时。Use when building React + antd web apps and need to implement Table."
component: Table
group: 数据展示
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Table（表格）

> 来源：https://ant.design/components/table-cn

## 用途

展示行列数据。

## 何时使用

- 当有大量结构化的数据需要展现时；
- 当需要对数据进行排序、搜索、分页、自定义操作等复杂行为时。

## 基础用法

```tsx
import React from 'react';
import { Flex, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';

interface DataType {
  key: string;
  name: string;
  age: number;
  address: string;
  tags: string[];
}

const columns: TableProps<DataType>['columns'] = [
  {
// ...
```

## 组合提示

通常与 `Pagination`、`Tag`、`Popconfirm` 搭配使用。
