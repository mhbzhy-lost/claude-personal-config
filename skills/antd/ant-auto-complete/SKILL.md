---
name: ant-auto-complete
description: "Ant Design AutoComplete 组件文档与用法。输入框自动完成功能。"
tech_stack: [antd, react, frontend]
language: [typescript]
---

# AutoComplete（自动完成）

> 来源：https://ant.design/components/auto-complete-cn

## 用途

输入框自动完成功能。

## 何时使用

- 需要一个输入框而不是选择器。
- 需要输入建议/辅助提示。
和 Select 的区别是：
- AutoComplete 是一个带提示的文本输入框，用户可以自由输入，关键词是辅助**输入**。
- Select 是在限定的可选项中进行选择，关键词是**选择**。

## 基础用法

```tsx
import React, { useState } from 'react';
import { AutoComplete } from 'antd';
import type { AutoCompleteProps } from 'antd';

const mockVal = (str: string, repeat = 1) => ({
  value: str.repeat(repeat),
});

const App: React.FC = () => {
  const [value, setValue] = useState('');
  const [options, setOptions] = useState<AutoCompleteProps['options']>([]);
  const [anotherOptions, setAnotherOptions] = useState<AutoCompleteProps['options']>([]);

  const getPanelValue = (searchText: string) =>
// ...
```

## 关键 API（摘要）

- `backfill`：使用键盘选择选项的时候把选中项回填到输入框中
- `children`：自定义输入框
- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `defaultActiveFirstOption`：是否默认高亮第一个选项
- `defaultOpen`：是否默认展开下拉菜单
- `defaultValue`：指定默认选中的条目
