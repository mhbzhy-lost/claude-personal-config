---
name: ant-date-picker
description: "Ant Design DatePicker 组件文档与用法。输入或选择日期的控件。"
tech_stack: [antd, react, frontend]
language: [typescript]
capability: [ui-input, ui-overlay]
---

# DatePicker（日期选择框）

> 来源：https://ant.design/components/date-picker-cn

## 用途

输入或选择日期的控件。

## 何时使用

当用户需要输入一个日期，可以点击标准输入框，弹出日期面板进行选择。

## 基础用法

```tsx
import React from 'react';
import type { DatePickerProps } from 'antd';
import { DatePicker, Space } from 'antd';

const onChange: DatePickerProps['onChange'] = (date, dateString) => {
  console.log(date, dateString);
};

const App: React.FC = () => (
  <Space vertical>
    <DatePicker onChange={onChange} />
    <DatePicker onChange={onChange} picker="week" />
    <DatePicker onChange={onChange} picker="month" />
    <DatePicker onChange={onChange} picker="quarter" />
// ...
```

## 组合提示

通常与 `Form`、`TimePicker` 搭配使用。
