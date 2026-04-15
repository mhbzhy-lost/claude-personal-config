---
name: ant-icon
description: "Ant Design Icon 组件文档与用法。Icon 组件使用指南。Use when building React + antd web apps and need to implement Icon."
component: Icon
group: 通用
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Icon（图标）

> 来源：https://ant.design/components/icon-cn

## 用途

语义化的矢量图形。

## 何时使用

语义化的矢量图形。

## 基础用法

```tsx
import React from 'react';
import {
  HomeOutlined,
  LoadingOutlined,
  SettingFilled,
  SmileOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Space } from 'antd';

const App: React.FC = () => (
  <Space>
    <HomeOutlined />
    <SettingFilled />
// ...
```
