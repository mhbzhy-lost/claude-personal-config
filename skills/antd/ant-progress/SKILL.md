---
name: ant-progress
description: "Ant Design Progress 组件文档与用法。展示操作的当前进度。Use when building React + antd web apps and need to implement Progress."
tech_stack: [antd]
---

# Progress（进度条）

> 来源：https://ant.design/components/progress-cn

## 用途

展示操作的当前进度。

## 何时使用

在操作需要较长时间才能完成时，为用户显示该操作的当前进度和状态。
- 当一个操作会打断当前界面，或者需要在后台运行，且耗时可能超过 2 秒时；
- 当需要显示一个操作完成的百分比时。

## 基础用法

```tsx
import React from 'react';
import { Flex, Progress } from 'antd';

const App: React.FC = () => (
  <Flex align="center" gap="small">
    <Progress
      type="circle"
      railColor="#e6f4ff"
      percent={60}
      strokeWidth={20}
      size={14}
      format={(number) => `进行中，已完成${number}%`}
    />
    <span>代码发布</span>
// ...
```

## 关键 API（摘要）

- `format`：内容的模板函数
- `percent`：百分比
- `railColor`：未完成的分段的颜色
- `showInfo`：是否显示进度数值或状态图标
- `status`：状态，可选：`success` `exception` `normal` `active`(仅限 line)
- `strokeColor`：进度条的色彩

## 组合提示

通常与 `Upload`、`Spin` 搭配使用。
