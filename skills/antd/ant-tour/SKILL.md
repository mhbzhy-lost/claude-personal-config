---
name: ant-tour
description: "Ant Design Tour 组件文档与用法。用于分步引导用户了解产品功能的气泡组件。"
tech_stack: [antd, react, frontend]
language: [typescript]
---

# Tour（漫游式引导）

> 来源：https://ant.design/components/tour-cn

## 用途

用于分步引导用户了解产品功能的气泡组件。

## 何时使用

常用于引导用户了解产品功能。

## 基础用法

```tsx
import React, { useRef, useState } from 'react';
import { EllipsisOutlined } from '@ant-design/icons';
import { Button, Divider, Space, Tour } from 'antd';
import type { TourProps } from 'antd';

const App: React.FC = () => {
  const ref1 = useRef(null);
  const ref2 = useRef(null);
  const ref3 = useRef(null);

  const [open, setOpen] = useState<boolean>(false);

  const steps: TourProps['steps'] = [
    {
// ...
```

## 组合提示

通常与 `Button`、`Modal` 搭配使用。
