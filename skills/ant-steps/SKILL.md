---
name: ant-steps
description: "Ant Design Steps 组件文档与用法。引导用户按照流程完成任务的导航条。Use when building React + antd web apps and need to implement Steps."
component: Steps
group: 导航
applies_to:
  markers_any:
    - "dependency: antd"
---

# Steps（步骤条）

> 来源：https://ant.design/components/steps-cn

## 用途

引导用户按照流程完成任务的导航条。

## 何时使用

当任务复杂或者存在先后关系时，将其分解成一系列步骤，从而简化任务。

## 基础用法

```tsx
import React from 'react';
import { Flex, Steps } from 'antd';

const content = 'This is a content.';
const items = [
  {
    title: 'Finished',
    content,
  },
  {
    title: 'In Progress',
    content,
    subTitle: 'Left 00:00:08',
  },
// ...
```

## 组合提示

通常与 `Form`、`Button` 搭配使用。
