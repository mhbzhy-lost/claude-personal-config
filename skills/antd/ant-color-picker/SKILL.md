---
name: ant-color-picker
description: "Ant Design ColorPicker 组件文档与用法。当用户需要自定义颜色选择的时候使用。"
tech_stack: [antd, react, frontend]
language: [typescript]
capability: [ui-input, ui-overlay]
---

# ColorPicker（颜色选择器）

> 来源：https://ant.design/components/color-picker-cn

## 用途

用于选择颜色。

## 何时使用

当用户需要自定义颜色选择的时候使用。

## 基础用法

```tsx
import React from 'react';
import { ColorPicker } from 'antd';

export default () => {
  const [color, setColor] = React.useState<string>('#1677ff');
  return (
    <ColorPicker
      value={color}
      allowClear
      onChange={(c) => {
        setColor(c.toHexString());
      }}
    />
  );
// ...
```

## 组合提示

通常与 `Form`、`Input` 搭配使用。
