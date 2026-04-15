---
name: ant-radio
description: "Ant Design Radio 组件文档与用法。用于在多个备选项中选中单个状态。Use when building React + antd web apps and need to implement Radio."
component: Radio
group: 数据录入
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Radio（单选框）

> 来源：https://ant.design/components/radio-cn

## 用途

用于在多个备选项中选中单个状态。

## 何时使用

- 用于在多个备选项中选中单个状态。
- 和 Select 的区别是，Radio 所有选项默认可见，方便用户在比较中选择，因此选项不宜过多。
```tsx
// 使用 Radio.Group 组件时，推荐的写法 ✅
return (

## 基础用法

```tsx
import React from 'react';
import { Radio } from 'antd';

const App: React.FC = () => <Radio>Radio</Radio>;

export default App;
```
