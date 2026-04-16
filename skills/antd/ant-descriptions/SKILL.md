---
name: ant-descriptions
description: "Ant Design Descriptions 组件文档与用法。展示多个只读字段的组合。Use when building React + antd web apps and need to implement Descriptions."
tech_stack: [antd]
---

# Descriptions（描述列表）

> 来源：https://ant.design/components/descriptions-cn

## 用途

展示多个只读字段的组合。

## 何时使用

常见于详情页的信息展示。
```tsx | pure
// >= 5.8.0 可用，推荐的写法 ✅
const items: DescriptionsProps['items'] = [
  {

## 基础用法

```tsx
import React from 'react';
import { Descriptions } from 'antd';
import type { DescriptionsProps } from 'antd';

const items: DescriptionsProps['items'] = [
  {
    key: '1',
    label: 'UserName',
    children: 'Zhou Maomao',
  },
  {
    key: '2',
    label: 'Telephone',
    children: '1810000000',
// ...
```
