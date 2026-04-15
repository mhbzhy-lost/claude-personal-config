---
name: ant-pagination
description: "Ant Design Pagination 组件文档与用法。分页器用于分隔长列表，每次只加载一个页面。Use when building React + antd web apps and need to implement Pagination."
component: Pagination
group: 导航
applies_to:
  markers_any:
    - "dependency: antd"
---

# Pagination（分页）

> 来源：https://ant.design/components/pagination-cn

## 用途

分页器用于分隔长列表，每次只加载一个页面。

## 何时使用

- 当加载/渲染所有数据将花费很多时间时；
- 可切换页码浏览数据。

## 基础用法

```tsx
import React from 'react';
import { Pagination } from 'antd';

const App: React.FC = () => <Pagination defaultCurrent={1} total={50} />;

export default App;
```

## 关键 API（摘要）

- `classNames`：自定义组件内部各语义化结构的类名。支持对象或函数
- `current`：当前页数
- `defaultCurrent`：默认的当前页数
- `defaultPageSize`：默认的每页条数
- `disabled`：禁用分页
- `hideOnSinglePage`：只有一页时是否隐藏分页器

## 组合提示

通常与 `Table`、`List` 搭配使用。
