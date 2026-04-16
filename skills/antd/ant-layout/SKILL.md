---
name: ant-layout
description: "Ant Design Layout 组件文档与用法。协助进行页面级整体布局。Use when building React + antd web apps and need to implement Layout."
tech_stack: [antd]
---

# Layout（布局）

> 来源：https://ant.design/components/layout-cn

## 用途

协助进行页面级整体布局。

## 何时使用

协助进行页面级整体布局。

## 基础用法

```tsx
import React from 'react';
import { Flex, Layout } from 'antd';

const { Header, Footer, Sider, Content } = Layout;

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  color: '#fff',
  height: 64,
  paddingInline: 48,
  lineHeight: '64px',
  backgroundColor: '#4096ff',
};

// ...
```

## 组合提示

通常与 `Menu`、`Breadcrumb` 搭配使用。
