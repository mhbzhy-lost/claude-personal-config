---
name: ant-dropdown
description: "Ant Design Dropdown 组件文档与用法。当页面上的操作命令过多时，用此组件可以收纳操作元素。点击或移入触点，会出现一个下拉菜单。可在列表中进行选择，并执行相应的命令。 - 用于收罗一组命令操作。 - Select 用于选择，而 Dropdown 是命令集合。"
tech_stack: [antd]
language: [typescript]
---

# Dropdown（下拉菜单）

> 来源：https://ant.design/components/dropdown-cn

## 用途

向下弹出的列表。

## 何时使用

当页面上的操作命令过多时，用此组件可以收纳操作元素。点击或移入触点，会出现一个下拉菜单。可在列表中进行选择，并执行相应的命令。
- 用于收罗一组命令操作。
- Select 用于选择，而 Dropdown 是命令集合。

## 基础用法

```tsx
import React from 'react';
import { DownOutlined, SmileOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Dropdown, Space } from 'antd';

const items: MenuProps['items'] = [
  {
    key: '1',
    label: (
      <a target="_blank" rel="noopener noreferrer" href="https://www.antgroup.com">
        1st menu item
      </a>
    ),
  },
// ...
```

## 组合提示

通常与 `Menu`、`Button` 搭配使用。
