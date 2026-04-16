---
name: ant-collapse
description: "Ant Design Collapse 组件文档与用法。可以折叠/展开的内容区域。"
tech_stack: [antd]
language: [typescript]
---

# Collapse（折叠面板）

> 来源：https://ant.design/components/collapse-cn

## 用途

可以折叠/展开的内容区域。

## 何时使用

- 对复杂区域进行分组和隐藏，保持页面的整洁。
- `手风琴` 是一种特殊的折叠面板，只允许单个内容区域展开。

## 基础用法

```tsx
import React from 'react';
import type { CollapseProps } from 'antd';
import { Collapse } from 'antd';

const text = `
  A dog is a type of domesticated animal.
  Known for its loyalty and faithfulness,
  it can be found as a welcome guest in many households across the world.
`;

const items: CollapseProps['items'] = [
  {
    key: '1',
    label: 'This is panel header 1',
// ...
```

## 组合提示

通常与 `Card`、`List` 搭配使用。
