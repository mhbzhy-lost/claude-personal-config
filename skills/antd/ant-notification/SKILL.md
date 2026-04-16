---
name: ant-notification
description: "Ant Design Notification 组件文档与用法。全局展示通知提醒信息。"
tech_stack: [antd, react, frontend]
language: [typescript]
---

# Notification（通知提醒框）

> 来源：https://ant.design/components/notification-cn

## 用途

全局展示通知提醒信息。

## 何时使用

在系统四个角显示通知提醒信息。经常用于以下情况：
- 较为复杂的通知内容。
- 带有交互的通知，给出用户下一步的行动点。
- 系统主动推送。

## 基础用法

```tsx
import React from 'react';
import { Button, notification } from 'antd';

const openNotification = () => {
  notification.open({
    title: 'Notification Title',
    description:
      'This is the content of the notification. This is the content of the notification. This is the content of the notification.',
    onClick: () => {
      console.log('Notification Clicked!');
    },
  });
};
const App: React.FC = () => (
// ...
```

## 关键 API（摘要）

- `btn`：自定义按钮组，请使用 `actions` 替换
- `className`：自定义 CSS class
- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `closable`：是否显示右上角的关闭按钮
- `closeIcon`：自定义关闭图标
- `description`：通知提醒内容，必选

## 组合提示

通常与 `Message` 搭配使用。
