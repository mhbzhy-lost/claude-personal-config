---
name: ant-grid
description: "Ant Design Grid 组件文档与用法。Grid 组件使用指南。"
tech_stack: [antd]
language: [typescript]
---

# Grid（栅格）

> 来源：https://ant.design/components/grid-cn

## 用途

24 栅格系统。

## 何时使用

24 栅格系统。

## 基础用法

```tsx
import React from 'react';
import { Col, Row } from 'antd';

const App: React.FC = () => (
  <>
    <Row>
      <Col span={24}>col</Col>
    </Row>
    <Row>
      <Col span={12}>col-12</Col>
      <Col span={12}>col-12</Col>
    </Row>
    <Row>
      <Col span={8}>col-8</Col>
// ...
```
