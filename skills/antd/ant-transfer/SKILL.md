---
name: ant-transfer
description: "Ant Design Transfer 组件文档与用法。- 需要在多个可选项中进行多选时。 - 比起 Select 和 TreeSelect，穿梭框占据更大的空间，可以展示可选项的更多信息。 穿梭选择框用直观的方式在两栏中移动元素，完成选择行为。 选择一个或以上的选项后，点击对应的方向键，可以把选中的选项移动到另一栏。其中，左边一栏为 source，右边一栏为 target，API 的设计也反映了这两个概念。"
tech_stack: [antd, react, frontend]
language: [typescript]
capability: [ui-input]
---

# Transfer（穿梭框）

> 来源：https://ant.design/components/transfer-cn

## 用途

双栏穿梭选择框。

## 何时使用

- 需要在多个可选项中进行多选时。
- 比起 Select 和 TreeSelect，穿梭框占据更大的空间，可以展示可选项的更多信息。
穿梭选择框用直观的方式在两栏中移动元素，完成选择行为。
选择一个或以上的选项后，点击对应的方向键，可以把选中的选项移动到另一栏。其中，左边一栏为 `source`，右边一栏为 `target`，API 的设计也反映了这两个概念。
> 注意：穿梭框组件只支持受控使用，不支持非受控模式。

## 基础用法

```tsx
import React, { useState } from 'react';
import { Transfer } from 'antd';
import type { TransferProps } from 'antd';

interface RecordType {
  key: string;
  title: string;
  description: string;
}

const mockData = Array.from({ length: 20 }).map<RecordType>((_, i) => ({
  key: i.toString(),
  title: `content${i + 1}`,
  description: `description of content${i + 1}`,
// ...
```

## 组合提示

通常与 `Table`、`Checkbox` 搭配使用。
