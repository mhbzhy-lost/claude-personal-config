---
name: ant-menu
description: "Ant Design Menu 组件文档与用法。为页面和功能提供导航的菜单列表。Use when building React + antd web apps and need to implement Menu."
component: Menu
group: 导航
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Menu（导航菜单）

> 来源：https://ant.design/components/menu-cn

## 用途

为页面和功能提供导航的菜单列表。

## 何时使用

导航菜单是一个网站的灵魂，用户依赖导航在各个页面中进行跳转。一般分为顶部导航和侧边导航，顶部导航提供全局性的类目和功能，侧边导航提供多级结构来收纳和排列网站架构。
更多布局和导航的使用可以参考：[通用布局](/components/layout-cn)。

## 基础用法

```tsx
import React, { useState } from 'react';
import {
  AppstoreOutlined,
  ContainerOutlined,
  DesktopOutlined,
  MailOutlined,
  PieChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { ConfigProvider, Menu, Space, theme } from 'antd';

type MenuItem = Required<MenuProps>['items'][number];

// ...
```

## 组合提示

通常与 `Layout`、`Dropdown` 搭配使用。
