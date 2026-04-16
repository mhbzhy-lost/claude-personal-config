---
name: ant-badge
description: "Ant Design Badge 组件文档与用法。图标右上角的圆形徽标数字。"
tech_stack: [antd]
---

# Badge（徽标数）

> 来源：https://ant.design/components/badge-cn

## 用途

图标右上角的圆形徽标数字。

## 何时使用

一般出现在通知图标或头像的右上角，用于显示需要处理的消息条数，通过醒目视觉形式吸引用户处理。

## 基础用法

```tsx
import React from 'react';
import { ClockCircleOutlined } from '@ant-design/icons';
import { Avatar, Badge, Space } from 'antd';

const App: React.FC = () => (
  <Space size="medium">
    <Badge count={5}>
      <Avatar shape="square" size="large" />
    </Badge>
    <Badge count={0} showZero>
      <Avatar shape="square" size="large" />
    </Badge>
    <Badge count={<ClockCircleOutlined style={{ color: '#f5222d' }} />}>
      <Avatar shape="square" size="large" />
// ...
```

## 组合提示

通常与 `Avatar`、`Tabs` 搭配使用。
