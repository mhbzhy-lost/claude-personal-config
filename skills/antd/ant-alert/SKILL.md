---
name: ant-alert
description: "Ant Design Alert 组件文档与用法。警告提示，展现需要关注的信息。"
tech_stack: [antd]
language: [typescript]
---

# Alert（警告提示）

> 来源：https://ant.design/components/alert-cn

## 用途

警告提示，展现需要关注的信息。

## 何时使用

- 当某个页面需要向用户显示警告的信息时。
- 非浮层的静态展现形式，始终展现，不会自动消失，用户可以点击关闭。

## 基础用法

```tsx
import React from 'react';
import { Alert } from 'antd';

const App: React.FC = () => <Alert title="Success Text" type="success" />;

export default App;
```

## 关键 API（摘要）

- `afterClose`：关闭动画结束后触发的回调函数，请使用 `closable.afterClose` 替换
- `banner`：是否用作顶部公告
- `classNames`：自定义组件内部各语义化结构的类名。支持对象或函数
- `closable`：可关闭配置，>=5.15.0: 支持 `aria-*`
- `description`：警告提示的辅助性文字介绍
- `icon`：自定义图标，`showIcon` 为 true 时有效

## 组合提示

通常与 `Result`、`Modal` 搭配使用。
