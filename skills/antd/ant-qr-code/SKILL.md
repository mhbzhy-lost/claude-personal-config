---
name: ant-qr-code
description: "Ant Design QRCode 组件文档与用法。能够将文本转换生成二维码的组件，支持自定义配色和 Logo 配置。"
tech_stack: [antd, react, frontend]
language: [typescript]
---

# QRCode（二维码）

> 来源：https://ant.design/components/qr-code-cn

## 用途

能够将文本转换生成二维码的组件，支持自定义配色和 Logo 配置。

## 何时使用

当需要将文本转换成为二维码时使用。

## 基础用法

```tsx
import React from 'react';
import { Button, Popover, QRCode } from 'antd';

const App: React.FC = () => (
  <Popover content={<QRCode value="https://ant.design" bordered={false} />}>
    <Button type="primary">Hover me</Button>
  </Popover>
);

export default App;
```

## 组合提示

通常与 `Modal`、`Card` 搭配使用。
