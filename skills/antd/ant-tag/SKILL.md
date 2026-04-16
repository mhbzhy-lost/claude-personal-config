---
name: ant-tag
description: "Ant Design Tag 组件文档与用法。进行标记和分类的小标签。"
tech_stack: [antd]
---

# Tag（标签）

> 来源：https://ant.design/components/tag-cn

## 用途

进行标记和分类的小标签。

## 何时使用

- 用于标记事物的属性和维度。
- 进行分类。

## 基础用法

```tsx
import React from 'react';
import { CloseCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { Flex, Tag } from 'antd';

const preventDefault = (e: React.MouseEvent<HTMLElement>) => {
  e.preventDefault();
  console.log('Clicked! But prevent default.');
};

const App: React.FC = () => (
  <Flex gap="small" align="center" wrap>
    <Tag>Tag 1</Tag>
    <Tag>
      <a
// ...
```

## 组合提示

通常与 `Select`、`Table` 搭配使用。
