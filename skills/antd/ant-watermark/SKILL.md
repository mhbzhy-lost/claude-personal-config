---
name: ant-watermark
description: "Ant Design Watermark 组件文档与用法。给页面的某个区域加上水印。Use when building React + antd web apps and need to implement Watermark."
component: Watermark
group: 反馈
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Watermark（水印）

> 来源：https://ant.design/components/watermark-cn

## 用途

给页面的某个区域加上水印。

## 何时使用

- 页面需要添加水印标识版权时使用。
- 适用于防止信息盗用。

## 基础用法

```tsx
import React from 'react';
import { Watermark } from 'antd';

const App: React.FC = () => (
  <Watermark content="Ant Design">
    <div style={{ height: 500 }} />
  </Watermark>
);

export default App;
```

## 组合提示

通常与 `Layout`、`ConfigProvider` 搭配使用。
