---
name: ant-checkbox
description: "Ant Design Checkbox 组件文档与用法。收集用户的多项选择。Use when building React + antd web apps and need to implement Checkbox."
component: Checkbox
group: 数据录入
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Checkbox（多选框）

> 来源：https://ant.design/components/checkbox-cn

## 用途

收集用户的多项选择。

## 何时使用

- 在一组可选项中进行多项选择时；
- 单独使用可以表示两种状态之间的切换，和 `switch` 类似。区别在于切换 `switch` 会直接触发状态改变，而 `checkbox` 一般用于状态标记，需要和提交操作配合。

## 基础用法

```tsx
import React from 'react';
import { Checkbox } from 'antd';
import type { CheckboxProps } from 'antd';

const onChange: CheckboxProps['onChange'] = (e) => {
  console.log(`checked = ${e.target.checked}`);
};

const App: React.FC = () => <Checkbox onChange={onChange}>Checkbox</Checkbox>;

export default App;
```
