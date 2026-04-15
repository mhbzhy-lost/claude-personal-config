---
name: ant-carousel
description: "Ant Design Carousel 组件文档与用法。- 当有一组平级的内容。 - 当内容空间不足时，可以用走马灯的形式进行收纳，进行轮播展现。 - 常用于一组图片或卡片轮播。Use when building React + antd web apps and need to implement Carousel."
component: Carousel
group: 数据展示
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Carousel（走马灯）

> 来源：https://ant.design/components/carousel-cn

## 用途

一组轮播的区域。

## 何时使用

- 当有一组平级的内容。
- 当内容空间不足时，可以用走马灯的形式进行收纳，进行轮播展现。
- 常用于一组图片或卡片轮播。

## 基础用法

```tsx
import React from 'react';
import { Carousel } from 'antd';

const contentStyle: React.CSSProperties = {
  margin: 0,
  height: '160px',
  color: '#fff',
  lineHeight: '160px',
  textAlign: 'center',
  background: '#364d79',
};

const App: React.FC = () => {
  const onChange = (currentSlide: number) => {
// ...
```

## 关键 API（摘要）

- `autoplay`：是否自动切换，如果为 object 可以指定 `dotDuration` 来展示指示点进度条
- `autoplaySpeed`：自动切换的间隔（毫秒）
- `adaptiveHeight`：高度自适应
- `dotPlacement`：面板指示点位置，可选 `top` `bottom` `start` `end`
- `dotPosition`：面板指示点位置，可选 `top` `bottom` `left` `right` `start` `end`，请使…
- `dots`：是否显示面板指示点，如果为 `object` 则可以指定 `dotsClass`
