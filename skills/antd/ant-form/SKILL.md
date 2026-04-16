---
name: ant-form
description: "Ant Design Form 组件文档与用法。高性能表单控件，自带数据域管理。包含数据录入、校验以及对应样式。"
tech_stack: [antd, react, frontend]
language: [typescript]
---

# Form（表单）

> 来源：https://ant.design/components/form-cn

## 用途

高性能表单控件，自带数据域管理。包含数据录入、校验以及对应样式。

## 何时使用

- 用于创建一个实体或收集信息。
- 需要对输入的数据类型进行校验时。

## 基础用法

```tsx
import React from 'react';
import type { FormProps } from 'antd';
import { Button, Checkbox, Form, Input } from 'antd';

type FieldType = {
  username?: string;
  password?: string;
  remember?: string;
};

const onFinish: FormProps<FieldType>['onFinish'] = (values) => {
  console.log('Success:', values);
};

// ...
```

## 组合提示

通常与 `Input`、`Select`、`DatePicker`、`Button` 搭配使用。
