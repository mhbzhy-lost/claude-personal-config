---
name: ant-message
description: "Ant Design Message 组件文档与用法。全局展示操作反馈信息。"
tech_stack: [antd]
---

# Message（全局提示）

> 来源：https://ant.design/components/message-cn

## 用途

全局展示操作反馈信息。

## 何时使用

- 可提供成功、警告和错误等反馈信息。
- 顶部居中显示并自动消失，是一种不打断用户操作的轻量级提示方式。

## 基础用法

```tsx
import React from 'react';
import { ConfigProvider, message } from 'antd';

/** Test usage. Do not use in your production. */
const { _InternalPanelDoNotUseOrYouWillBeFired: InternalPanel } = message;

export default () => (
  <>
    <ConfigProvider
      theme={{
        components: {
          Message: {
            contentPadding: 40,
            contentBg: '#e6f4ff',
// ...
```

## 关键 API（摘要）

- `duration`：自动关闭的延时，单位秒。设为 0 时不自动关闭
- `onClose`：关闭时触发的回调函数
- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `content`：提示内容
- `duration`：自动关闭的延时，单位秒。设为 0 时不自动关闭
- `icon`：自定义图标

## 组合提示

通常与 `Notification` 搭配使用。
