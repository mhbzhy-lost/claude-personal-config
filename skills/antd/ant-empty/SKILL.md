---
name: ant-empty
description: "Ant Design Empty 组件文档与用法。空状态时的展示占位图。Use when building React + antd web apps and need to implement Empty."
tech_stack: [antd]
---

# Empty（空状态）

> 来源：https://ant.design/components/empty-cn

## 用途

空状态时的展示占位图。

## 何时使用

- 当目前没有数据时，用于显式的用户提示。
- 初始化场景时的引导创建流程。

## 基础用法

```tsx
import React from 'react';
import { Empty } from 'antd';

const App: React.FC = () => <Empty />;

export default App;
```

## 关键 API（摘要）

- `description`：自定义描述内容
- `image`：设置显示图片，为 string 时表示自定义图片地址。
- `imageStyle`：图片样式
- `styles`：用于自定义组件内部各语义化结构的行内 style，支持对象或函数
