---
name: taro-ui-libraries
description: Taro 生态常用 UI 组件库（@tarojs/components、NutUI、Taro UI、@antmjs/vantui）选型、安装与使用
tech_stack: [taro]
language: [javascript, typescript]
capability: [ui-display, ui-input]
version: "nutui 4.0; taro-ui@next (Taro 3); @antmjs/vantui unversioned"
collected_at: 2026-04-18
---

# Taro UI Libraries（Taro UI 组件库）

> 来源：https://docs.taro.zone/docs/nutui, https://docs.taro.zone/docs/components-desc, taro-ui README, @antmjs/vantui README

## 用途
为 Taro 跨端项目挑选并接入合适的 UI 组件库：`@tarojs/components` 为基础层；NutUI / Taro UI / vantui 在其上提供业务级组件。

## 何时使用各库

| 库 | 框架 | 平台 | 适用场景 |
|----|------|------|----------|
| `@tarojs/components` | React/Vue | 全平台 | 基础元素（View/Text/Image/Map 等），任何 Taro 项目必用 |
| NutUI 4.0 | Vue3 | 小程序 + H5 | Taro 3.5+ Vue3 项目；80+ 组件，CSS 动态主题 |
| Taro UI | React | 微信/支付宝/百度小程序 + H5（**不支持 RN**） | 老牌 React 方案；Taro 3 用 `taro-ui@next` |
| @antmjs/vantui | React + Taro | 微信/支付宝/抖音小程序 + H5（**不支持 RN**） | 需要 Vant 风格；TypeScript 完整类型；50+ 组件 |

## 基础组件（@tarojs/components）

### React：显式导入
```jsx
import { View, Text, Map } from '@tarojs/components'

<View><Text>hello</Text></View>
```

### Vue：模板直接使用
```vue
<template><view><text>hello</text></view></template>
```

### 命名与事件规范
- 组件名用 PascalCase/CamelCase（`<Map />`）
- **事件绑定统一用 `on` 前缀**，而非小程序 `bind`（Taro 会转译）

## NutUI 4.0 接入

```bash
npm install -g @tarojs/cli
taro init myApp          # 选择 Vue3 + NutUI4.0 模板
npm i @nutui/nutui-taro @tarojs/plugin-html
```

```js
// config/index.js
module.exports = {
  plugins: ['@tarojs/plugin-html'],
  sass: {
    data: `@import "@nutui/nutui-taro/dist/styles/variables.scss";`,
  },
  designWidth: 375,
  deviceRatio: { 640: 2.34/2, 750: 1, 828: 1.81/2, 375: 2/1 },
}
```

```ts
// 标准导入
import { Button } from '@nutui/nutui-taro'
import '@nutui/nutui-taro/dist/style.css'

// 或通过 unplugin-vue-components 自动按需：<nut-button />
```

## Taro UI 接入（React）

```bash
npm install -g @tarojs/cli   # 需 Taro >= 1.0.0-beta.18
npm install taro-ui          # Taro 3 用 npm i --save taro-ui@next
```

```js
import { AtButton } from 'taro-ui'
```
> Vue 版见 https://github.com/psaren/taro-ui-vue

## @antmjs/vantui 特点
- TypeScript 编写，完整类型定义
- 与 Vant Weapp UI/API 保持一致（99% 样式迁移）
- 支持主题定制、按需加载、50+ 组件
- 文档：https://antmjs.github.io/vantui

## 注意事项
- **NutUI 4.0 仅支持 Vue3 + Taro 3.5+**，且强依赖 `@tarojs/plugin-html`
- **Taro UI 与 @antmjs/vantui 均不支持 React Native 端**
- 基础组件在某些平台缺失时，文档会回退到小程序原生组件说明，需遵循 Taro 约定
- 个性化 UI 需求建议通过主题变量覆盖或 class/style 扩展，而非 fork 组件库
- 事件必须用 `onClick / onChange` 等 on 前缀，`bindtap` 形式不可用

## 组合提示
- NutUI / vantui 均需 `@tarojs/plugin-html`，与前端路由库（见 taro-routing）可共存
- 按需加载（unplugin-vue-components / babel-plugin-import）可显著减小小程序包体
