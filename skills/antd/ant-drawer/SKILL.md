---
name: ant-drawer
description: "Ant Design Drawer 组件文档与用法。屏幕边缘滑出的浮层面板。"
tech_stack: [antd]
---

# Drawer（抽屉）

> 来源：https://ant.design/components/drawer-cn

## 用途

屏幕边缘滑出的浮层面板。

## 何时使用

抽屉从父窗体边缘滑入，覆盖住部分父窗体内容。用户在抽屉内操作时不必离开当前任务，操作完成后，可以平滑地回到原任务。
- 当需要一个附加的面板来控制父窗体内容，这个面板在需要时呼出。比如，控制界面展示样式，往界面中添加内容。
- 当需要在当前任务流中插入临时任务，创建或预览附加内容。比如展示协议条款，创建子对象。
> 开发者注意事项：
>

## 基础用法

```tsx
import React, { useState } from 'react';
import { Button, Drawer } from 'antd';

const App: React.FC = () => {
  const [open, setOpen] = useState(false);

  const showDrawer = () => {
    setOpen(true);
  };

  const onClose = () => {
    setOpen(false);
  };

// ...
```

## 关键 API（摘要）

- `className`：Drawer 容器外层 className 设置，如果需要设置最外层，请使用 rootClassName
- `classNames`：用于自定义 Drawer 组件内部各语义化结构的 class，支持对象或函数
- `closable`：是否显示关闭按钮。可通过 `placement` 配置其位置
- `destroyOnClose`：关闭时销毁 Drawer 里的子元素
- `destroyOnHidden`：关闭时销毁 Drawer 里的子元素
- `extra`：抽屉右上角的操作区域

## 组合提示

通常与 `Form`、`Button` 搭配使用。
