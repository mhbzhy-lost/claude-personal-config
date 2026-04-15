---
name: ant-slider
description: "Ant Design Slider 组件文档与用法。滑动型输入器，展示当前值和可选范围。Use when building React + antd web apps and need to implement Slider."
component: Slider
group: 数据录入
applies_to:
  markers_any:
    - "dependency: antd"
---

# Slider（滑动输入条）

> 来源：https://ant.design/components/slider-cn

## 用途

滑动型输入器，展示当前值和可选范围。

## 何时使用

当用户需要在数值区间/自定义区间内进行选择时，可为连续或离散值。

## 基础用法

```tsx
import React, { useState } from 'react';
import { Slider, Switch } from 'antd';

const App: React.FC = () => {
  const [disabled, setDisabled] = useState(false);

  const onChange = (checked: boolean) => {
    setDisabled(checked);
  };

  return (
    <>
      <Slider defaultValue={30} disabled={disabled} />
      <Slider range defaultValue={[20, 50]} disabled={disabled} />
// ...
```

## 关键 API（摘要）

- `defaultValue`：设置初始取值。当 `range` 为 false 时，使用 number，否则用 \[number, number]
- `disabled`：值为 true 时，滑块为禁用状态
- `keyboard`：支持使用键盘操作 handler
- `dots`：是否只能拖拽到刻度上
- `included`：`marks` 不为空对象时有效，值为 true 时表示值为包含关系，false 表示并列
- `marks`：刻度标记，key 的类型必须为 `number` 且取值在闭区间 \[min, max] 内，每个标签可以单独设置样式
