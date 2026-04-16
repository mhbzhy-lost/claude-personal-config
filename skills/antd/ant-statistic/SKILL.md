---
name: ant-statistic
description: "Ant Design Statistic 组件文档与用法。- 当需要突出某个或某组数字时。 - 当需要展示带描述的统计类数据时使用。"
tech_stack: [antd, react, frontend]
language: [typescript]
---

# Statistic（统计数值）

> 来源：https://ant.design/components/statistic-cn

## 用途

展示统计数值。

## 何时使用

- 当需要突出某个或某组数字时。
- 当需要展示带描述的统计类数据时使用。

## 基础用法

```tsx
import React from 'react';
import { Button, Col, Row, Statistic } from 'antd';

const App: React.FC = () => (
  <Row gutter={16}>
    <Col span={12}>
      <Statistic title="Active Users" value={112893} />
    </Col>
    <Col span={12}>
      <Statistic title="Account Balance (CNY)" value={112893} precision={2} />
      <Button style={{ marginTop: 16 }} type="primary">
        Recharge
      </Button>
    </Col>
// ...
```

## 组合提示

通常与 `Card`、`Dashboard` 搭配使用。
