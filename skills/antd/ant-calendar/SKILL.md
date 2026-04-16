---
name: ant-calendar
description: "Ant Design Calendar 组件文档与用法。按照日历形式展示数据的容器。"
tech_stack: [antd]
language: [typescript]
---

# Calendar（日历）

> 来源：https://ant.design/components/calendar-cn

## 用途

按照日历形式展示数据的容器。

## 何时使用

当数据是日期或按照日期划分时，例如日程、课表、价格日历等，农历等。目前支持年/月切换。

## 基础用法

```tsx
import React from 'react';
import { Calendar } from 'antd';
import type { CalendarProps } from 'antd';
import type { Dayjs } from 'dayjs';

const App: React.FC = () => {
  const onPanelChange = (value: Dayjs, mode: CalendarProps<Dayjs>['mode']) => {
    console.log(value.format('YYYY-MM-DD'), mode);
  };

  return <Calendar onPanelChange={onPanelChange} />;
};

export default App;
```

## 关键 API（摘要）

- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `dateFullCellRender`：自定义渲染日期单元格，返回内容覆盖单元格，>= 5.4.0 请用 `fullCellRender`
- `fullCellRender`：自定义单元格的内容
- `defaultValue`：默认展示的日期
- `disabledDate`：不可选择的日期，参数为当前 `value`，注意使用时
- `fullscreen`：是否全屏显示
