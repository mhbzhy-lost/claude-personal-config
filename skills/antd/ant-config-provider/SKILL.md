---
name: ant-config-provider
description: "Ant Design ConfigProvider 组件文档与用法。为组件提供统一的全局化配置。"
tech_stack: [antd]
---

# ConfigProvider（全局化配置）

> 来源：https://ant.design/components/config-provider-cn

## 用途

为组件提供统一的全局化配置。

## 何时使用

为组件提供统一的全局化配置。

## 基础用法

```tsx
import React, { useState } from 'react';
import {
  DownloadOutlined,
  LeftOutlined,
  MinusOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined as SearchIcon,
  SmileOutlined,
} from '@ant-design/icons';
import type { ConfigProviderProps, RadioChangeEvent } from 'antd';
import {
  Badge,
  Button,
// ...
```

## 关键 API（摘要）

- `componentSize`：设置 antd 组件大小
- `csp`：设置  配置
- `direction`：设置文本展示方向。
- `getPopupContainer`：弹出框（Select, Tooltip, Menu 等等）渲染父节点，默认渲染到 body 上。
- `getTargetContainer`：配置 Affix、Anchor 滚动监听容器。
- `iconPrefixCls`：设置图标统一样式前缀

## 组合提示

通常与 `all components` 搭配使用。
