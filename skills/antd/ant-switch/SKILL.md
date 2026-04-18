---
name: ant-switch
description: "Ant Design Switch 组件文档与用法。使用开关切换两种状态之间。"
tech_stack: [antd, react, frontend]
language: [typescript]
capability: [ui-input]
---

# Switch（开关）

> 来源：https://ant.design/components/switch-cn

## 用途

使用开关切换两种状态之间。

## 何时使用

- 需要表示开关状态/两种状态之间的切换时；
- 和 `checkbox` 的区别是，切换 `switch` 会直接触发状态改变，而 `checkbox` 一般用于状态标记，需要和提交操作配合。

## 基础用法

```tsx
import React from 'react';
import { Switch } from 'antd';

const onChange = (checked: boolean) => {
  console.log(`switch to ${checked}`);
};

const App: React.FC = () => <Switch defaultChecked onChange={onChange} />;

export default App;
```

## 关键 API（摘要）

- `checkedChildren`：选中时的内容
- `className`：Switch 器类名
- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `defaultChecked`：初始是否选中
- `defaultValue`：`defaultChecked` 的别名
- `disabled`：是否禁用
