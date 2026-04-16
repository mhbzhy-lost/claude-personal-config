---
name: ant-result
description: "Ant Design Result 组件文档与用法。用于反馈一系列操作任务的处理结果。"
tech_stack: [antd, react, frontend]
language: [typescript]
---

# Result（结果）

> 来源：https://ant.design/components/result-cn

## 用途

用于反馈一系列操作任务的处理结果。

## 何时使用

当有重要操作需告知用户处理结果，且反馈内容较为复杂时使用。

## 基础用法

```tsx
import React from 'react';
import { Button, Result } from 'antd';

const App: React.FC = () => (
  <Result
    status="403"
    title="403"
    subTitle="Sorry, you are not authorized to access this page."
    extra={<Button type="primary">Back Home</Button>}
  />
);

export default App;
```

## 关键 API（摘要）

- `extra`：操作区
- `icon`：自定义 icon
- `status`：结果的状态，决定图标和颜色
- `styles`：自定义组件内部各语义化结构的内联样式。支持对象或函数
- `subTitle`：subTitle 文字
- `title`：title 文字
