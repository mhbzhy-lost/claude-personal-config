---
name: ant-timeline
description: "Ant Design Timeline 组件文档与用法。垂直展示的时间流信息。"
tech_stack: [antd, react, frontend]
language: [typescript]
---

# Timeline（时间轴）

> 来源：https://ant.design/components/timeline-cn

## 用途

垂直展示的时间流信息。

## 何时使用

- 当有一系列信息需按时间排列时，可正序和倒序。
- 需要有一条时间轴进行视觉上的串联时。

## 基础用法

```tsx
import React from 'react';
import { Timeline } from 'antd';

const App: React.FC = () => (
  <Timeline
    items={[
      {
        content: 'Create a services site 2015-09-01',
      },
      {
        content: 'Solve initial network problems 2015-09-01',
      },
      {
        content: 'Technical testing 2015-09-01',
// ...
```
