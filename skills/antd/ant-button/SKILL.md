---
name: ant-button
description: "Ant Design Button 组件文档与用法。按钮用于开始一个即时操作。"
tech_stack: [antd]
---

# Button（按钮）

> 来源：https://ant.design/components/button-cn

## 用途

按钮用于开始一个即时操作。

## 何时使用

标记了一个（或封装一组）操作命令，响应用户点击行为，触发相应的业务逻辑。
在 Ant Design 中我们提供了五种按钮。
- 🔵 主按钮：用于主行动点，一个操作区域只能有一个主按钮。
- ⚪️ 默认按钮：用于没有主次之分的一组行动点。
- 😶 虚线按钮：常用于添加操作。

## 基础用法

```tsx
import React from 'react';
import { Button, Flex } from 'antd';

const App: React.FC = () => (
  <Flex gap="small" wrap>
    <Button type="primary">Primary Button</Button>
    <Button>Default Button</Button>
    <Button type="dashed">Dashed Button</Button>
    <Button type="text">Text Button</Button>
    <Button type="link">Link Button</Button>
  </Flex>
);

export default App;
```

## 关键 API（摘要）

- `block`：将按钮宽度调整为其父宽度的选项
- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `color`：设置按钮的颜色
- `danger`：语法糖，设置危险按钮。当设置 `color` 时会以后者为准
- `disabled`：设置按钮失效状态
- `ghost`：幽灵属性，使按钮背景透明

## 组合提示

通常与 `Form`、`Modal`、`Popconfirm`、`Space` 搭配使用。
