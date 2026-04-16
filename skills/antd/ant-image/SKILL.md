---
name: ant-image
description: "Ant Design Image 组件文档与用法。- 需要展示图片时使用。 - 加载显示大图或加载失败时容错处理。Use when building React + antd web apps and need to implement Image."
tech_stack: [antd]
---

# Image（图片）

> 来源：https://ant.design/components/image-cn

## 用途

可预览的图片。

## 何时使用

- 需要展示图片时使用。
- 加载显示大图或加载失败时容错处理。

## 基础用法

```tsx
import React from 'react';
import { Image } from 'antd';

const App: React.FC = () => (
  <Image
    width={200}
    alt="basic"
    src="https://zos.alipayobjects.com/rmsportal/jkjgkEfvpUPVyRjUImniVslZfWPnJuuZ.png"
  />
);

export default App;
```
