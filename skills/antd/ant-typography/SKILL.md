---
name: ant-typography
description: "Ant Design Typography 组件文档与用法。- 当需要展示标题、段落、列表内容时使用，如文章/博客/日志的文本样式。 - 当需要一列基于文本的基础操作时，如拷贝/省略/可编辑。"
tech_stack: [antd, react, frontend]
language: [typescript]
capability: [ui-display]
---

# Typography（排版）

> 来源：https://ant.design/components/typography-cn

## 用途

文本的基本格式。

## 何时使用

- 当需要展示标题、段落、列表内容时使用，如文章/博客/日志的文本样式。
- 当需要一列基于文本的基础操作时，如拷贝/省略/可编辑。

## 基础用法

```tsx
import React from 'react';
import { Divider, Typography } from 'antd';

const { Title, Paragraph, Text, Link } = Typography;

const blockContent = `AntV 是蚂蚁集团全新一代数据可视化解决方案，致力于提供一套简单方便、专业可靠、不限可能的数据可视化最佳实践。得益于丰富的业务场景和用户需求挑战，AntV 经历多年积累与不断打磨，已支撑整个阿里集团内外 20000+ 业务系统，通过了日均千万级 UV 产品的严苛考验。
我们正在基础图表，图分析，图编辑，地理空间可视化，智能可视化等各个可视化的领域耕耘，欢迎同路人一起前行。`;

const App: React.FC = () => (
  <Typography>
    <Title>Introduction</Title>

    <Paragraph>
      In the process of internal desktop applications development, many different design specs and
// ...
```
