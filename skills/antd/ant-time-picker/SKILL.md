---
name: ant-time-picker
description: "Ant Design TimePicker 组件文档与用法。输入或选择时间的控件。Use when building React + antd web apps and need to implement TimePicker."
tech_stack: [antd]
---

# TimePicker（时间选择框）

> 来源：https://ant.design/components/time-picker-cn

## 用途

输入或选择时间的控件。

## 何时使用

当用户需要输入一个时间，可以点击标准输入框，弹出时间面板进行选择。

## 基础用法

```tsx
import React from 'react';
import type { TimePickerProps } from 'antd';
import { TimePicker } from 'antd';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

const onChange: TimePickerProps['onChange'] = (time, timeString) => {
  console.log(time, timeString);
};

const App: React.FC = () => (
  <TimePicker onChange={onChange} defaultOpenValue={dayjs('00:00:00', 'HH:mm:ss')} />
// ...
```

## 关键 API（摘要）

- `cellRender`：自定义单元格的内容
- `changeOnScroll`：在滚动时改变选择值
- `className`：选择器类名
- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `defaultValue`：默认时间
- `disabled`：禁用全部操作
