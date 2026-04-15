---
name: ant-avatar
description: "Ant Design Avatar 组件文档与用法。用来代表用户或事物，支持图片、图标或字符展示。Use when building React + antd web apps and need to implement Avatar."
component: Avatar
group: 数据展示
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Avatar（头像）

> 来源：https://ant.design/components/avatar-cn

## 用途

用来代表用户或事物，支持图片、图标或字符展示。

## 何时使用

用来代表用户或事物，支持图片、图标或字符展示。

## 基础用法

```tsx
import React from 'react';
import { UserOutlined } from '@ant-design/icons';
import { Avatar, Space } from 'antd';

const App: React.FC = () => (
  <Space vertical size={16}>
    <Space wrap size={16}>
      <Avatar size={64} icon={<UserOutlined />} />
      <Avatar size="large" icon={<UserOutlined />} />
      <Avatar icon={<UserOutlined />} />
      <Avatar size="small" icon={<UserOutlined />} />
      <Avatar size={14} icon={<UserOutlined />} />
    </Space>
    <Space wrap size={16}>
// ...
```

## 组合提示

通常与 `Badge`、`Tooltip` 搭配使用。
