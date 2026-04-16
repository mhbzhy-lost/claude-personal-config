---
name: ant-affix
description: "Ant Design Affix 组件文档与用法。将页面元素钉在可视范围。"
tech_stack: [antd]
language: [typescript]
---

# Affix（固钉）

> 来源：https://ant.design/components/affix-cn

## 用途

将页面元素钉在可视范围。

## 何时使用

当内容区域比较长，需要滚动页面时，这部分内容对应的操作或者导航需要在滚动范围内始终展现。常用于侧边菜单和按钮组合。
页面可视范围过小时，慎用此功能以免出现遮挡页面内容的情况。
> 开发者注意事项：
>
> 自 `5.10.0` 起，由于 Affix 组件由 class 重构为 FC，之前获取 `ref` 并调用内部实例方法的写法都会失效。

## 基础用法

```tsx
import React from 'react';
import { Affix, Button } from 'antd';

const App: React.FC = () => {
  const [top, setTop] = React.useState<number>(100);
  const [bottom, setBottom] = React.useState<number>(100);
  return (
    <>
      <Affix offsetTop={top}>
        <Button type="primary" onClick={() => setTop(top + 10)}>
          Affix top
        </Button>
      </Affix>
      <br />
// ...
```

## 关键 API（摘要）

- `offsetTop`：距离窗口顶部达到指定偏移量后触发
- `target`：设置 `Affix` 需要监听其滚动事件的元素，值为一个返回对应 DOM 元素的函数
- `onChange`：固定状态改变时触发的回调函数

## 组合提示

通常与 `Layout`、`Button` 搭配使用。
