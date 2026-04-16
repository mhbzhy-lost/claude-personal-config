---
name: ant-tabs
description: "Ant Design Tabs 组件文档与用法。提供平级的区域将大块内容进行收纳和展现，保持界面整洁。 Ant Design 依次提供了三级选项卡，分别用于不同的场景。 - 卡片式的页签，提供可关闭的样式，常用于容器顶部。 - 既可用于容器顶部，也可用于容器内部，是最通用的 Tabs。 - Radio.Button 可作为更次级的页签来使用。"
tech_stack: [antd]
---

# Tabs（标签页）

> 来源：https://ant.design/components/tabs-cn

## 用途

选项卡切换组件。

## 何时使用

提供平级的区域将大块内容进行收纳和展现，保持界面整洁。
Ant Design 依次提供了三级选项卡，分别用于不同的场景。
- 卡片式的页签，提供可关闭的样式，常用于容器顶部。
- 既可用于容器顶部，也可用于容器内部，是最通用的 Tabs。
- [Radio.Button](/components/radio-cn/#radio-demo-radiobutton) 可作为更次级的页签来使用。

## 基础用法

```tsx
import React from 'react';
import { Tabs } from 'antd';
import type { TabsProps } from 'antd';

const onChange = (key: string) => {
  console.log(key);
};

const items: TabsProps['items'] = [
  {
    key: '1',
    label: 'Tab 1',
    children: 'Content of Tab Pane 1',
  },
// ...
```

## 组合提示

通常与 `Card`、`Badge` 搭配使用。
