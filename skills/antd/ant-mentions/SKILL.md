---
name: ant-mentions
description: "Ant Design Mentions 组件文档与用法。用于在输入中提及某人或某事。"
tech_stack: [antd]
---

# Mentions（提及）

> 来源：https://ant.design/components/mentions-cn

## 用途

用于在输入中提及某人或某事。

## 何时使用

用于在输入中提及某人或某事，常用于发布、聊天或评论功能。

## 基础用法

```tsx
import React from 'react';
import { Mentions } from 'antd';
import type { GetProp, MentionProps } from 'antd';

type MentionsOptionProps = GetProp<MentionProps, 'options'>[number];

const onChange = (value: string) => {
  console.log('Change:', value);
};

const onSelect = (option: MentionsOptionProps) => {
  console.log('select', option);
};

// ...
```
