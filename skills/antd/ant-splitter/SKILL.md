---
name: ant-splitter
description: "Ant Design Splitter 组件文档与用法。- 可以水平或垂直地分隔区域。 - 当需要自由拖拽调整各区域大小。 - 当需要指定区域的最大最小宽高时。"
tech_stack: [antd]
---

# Splitter（分隔面板）

> 来源：https://ant.design/components/splitter-cn

## 用途

自由切分指定区域

## 何时使用

- 可以水平或垂直地分隔区域。
- 当需要自由拖拽调整各区域大小。
- 当需要指定区域的最大最小宽高时。

## 基础用法

```tsx
import React from 'react';
import { Flex, Splitter, Typography } from 'antd';
import type { SplitterProps } from 'antd';

const Desc: React.FC<Readonly<{ text?: string | number }>> = (props) => (
  <Flex justify="center" align="center" style={{ height: '100%' }}>
    <Typography.Title type="secondary" level={5} style={{ whiteSpace: 'nowrap' }}>
      {props.text}
    </Typography.Title>
  </Flex>
);

const CustomSplitter: React.FC<Readonly<SplitterProps>> = ({ style, ...restProps }) => (
  <Splitter style={{ boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)', ...style }} {...restProps}>
// ...
```

## 组合提示

通常与 `Layout`、`Card` 搭配使用。
