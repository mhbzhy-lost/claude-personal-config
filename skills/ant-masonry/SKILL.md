---
name: ant-masonry
description: "Ant Design Masonry 组件文档与用法。- 展示不规则高度的图片或卡片时 - 需要按照列数均匀分布内容时 - 需要响应式调整列数时。Use when building React + antd web apps and need to implement Masonry."
component: Masonry
group: 布局
applies_to:
  markers_any:
    - "dependency: antd"
---

# Masonry（瀑布流）

> 来源：https://ant.design/components/masonry-cn

## 何时使用

- 展示不规则高度的图片或卡片时
- 需要按照列数均匀分布内容时
- 需要响应式调整列数时

## 基础用法

```tsx
import React from 'react';
import { Card, Masonry } from 'antd';
import type { MasonryProps } from 'antd';

type MasonryItemType = NonNullable<MasonryProps<number>['items']>[number];

const heights = [150, 50, 90, 70, 110, 150, 130, 80, 50, 90, 100, 150, 60, 50, 80].map(
  (height, index) => {
    const item: MasonryItemType = {
      key: `item-${index}`,
      data: height,
    };

    if (index === 4) {
// ...
```

## 组合提示

通常与 `Card`、`Grid` 搭配使用。
