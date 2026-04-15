---
name: ant-breadcrumb
description: "Ant Design Breadcrumb 组件文档与用法。显示当前页面在系统层级结构中的位置，并能向上返回。Use when building React + antd web apps and need to implement Breadcrumb."
component: Breadcrumb
group: 导航
applies_to:
  markers_any:
    - "dependency: antd"
---

# Breadcrumb（面包屑）

> 来源：https://ant.design/components/breadcrumb-cn

## 用途

显示当前页面在系统层级结构中的位置，并能向上返回。

## 何时使用

- 当系统拥有超过两级以上的层级结构时；
- 当需要告知用户『你在哪里』时；
- 当需要向上导航的功能时。
```jsx
// >=5.3.0 可用，推荐的写法 ✅

## 基础用法

```tsx
import React from 'react';
import { Breadcrumb } from 'antd';

const App: React.FC = () => {
  return (
    <Breadcrumb
      items={[
        {
          title: 'Home',
        },
        {
          title: <a href="">Application Center</a>,
        },
        {
// ...
```

## 组合提示

通常与 `Layout`、`Menu` 搭配使用。
