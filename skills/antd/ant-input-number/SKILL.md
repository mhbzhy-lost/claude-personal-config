---
name: ant-input-number
description: "Ant Design InputNumber 组件文档与用法。通过鼠标或键盘，输入范围内的数值。"
tech_stack: [antd, react, frontend]
language: [typescript]
capability: [ui-input]
---

# InputNumber（数字输入框）

> 来源：https://ant.design/components/input-number-cn

## 用途

通过鼠标或键盘，输入范围内的数值。

## 何时使用

当需要获取标准数值时。

## 基础用法

```tsx
import React from 'react';
import type { InputNumberProps } from 'antd';
import { InputNumber } from 'antd';

const onChange: InputNumberProps['onChange'] = (value) => {
  console.log('changed', value);
};

const App: React.FC = () => <InputNumber min={1} max={10} defaultValue={3} onChange={onChange} />;

export default App;
```

## 关键 API（摘要）

- `addonBefore`：带标签的 input，设置前置标签，请使用 Space.Compact 替换
- `changeOnBlur`：是否在失去焦点时，触发 `onChange` 事件（例如值超出范围时，重新限制回范围并触发事件）
- `changeOnWheel`：允许鼠标滚轮改变数值
- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `controls`：是否显示增减按钮，也可设置自定义箭头图标
- `decimalSeparator`：小数点
