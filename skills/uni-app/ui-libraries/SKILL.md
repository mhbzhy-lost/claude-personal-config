---
name: uni-app-ui-libraries
description: uni-ui 官方库与 uview-plus 第三方库在 uni-app 中的接入与 easycom 配置
tech_stack: [uni-app]
language: [javascript]
capability: [ui-display, ui-input]
version: "uni-app unversioned; uview-plus >=1.7.9"
collected_at: 2026-04-18
---

# uni-app UI 组件库

> 来源：https://uniapp.dcloud.net.cn/component/uniui/uni-ui.html、quickstart.html、https://uview-plus.jiangruyi.com

## 用途
为 uni-app 项目快速接入跨端 UI 组件：官方的 uni-ui（40+ 组件）或社区的 uview-plus（`up-*` 前缀），并通过 easycom 实现免导入使用。

## 何时使用
- 需要表单、日历、选择器、导航、徽标等常见组件 → uni-ui
- 追求更丰富的组件样式与工具方法（`uni.$u.xxx`）→ uview-plus
- 项目使用 vue-cli 而非 HBuilderX → 需手动 npm 安装 + 配置 easycom

## 基础用法

**uni-ui（推荐 HBuilderX 模板）**：新建项目时选 "uni-ui" 模板即自动配置。

**uni-ui（vue-cli / npm）**：

```bash
npm i @dcloudio/uni-ui sass sass-loader
```

`pages.json`：

```json
{
  "easycom": {
    "autoscan": true,
    "custom": {
      "^uni-(.*)": "@dcloudio/uni-ui/lib/uni-$1/uni-$1.vue"
    }
  }
}
```

模板中直接使用，无需 import：

```vue
<template>
  <uni-badge text="1" type="primary" />
</template>
```

**uview-plus（Composition API）**：

```vue
<template>
  <up-action-sheet :actions="list" v-model:show="show" />
</template>

<script setup>
import { ref } from 'vue';
const list = ref([{ text: '点赞', color: 'blue' }, { text: '分享' }]);
const show = ref(true);
</script>
```

全局工具访问：`uni.$u.xxx`（1.7.9+，无需 Vue 上下文即可调用）。

## 关键 API（摘要）
- **easycom**：满足 `components/组件名/组件名.vue` 目录结构或 `pages.json` 正则匹配即可免 import/register
- **uni-ui 安装途径**：HBuilderX 模板、uni_modules 逐个安装、uni_modules 全量包、npm（需 sass）
- **uview-plus 手动 import**（不推荐）：`import upActionSheet from "uview-plus/components/up-action-sheet/up-action-sheet.vue"`
- **常用 uni-ui 组件**：`uni-badge`、`uni-calendar`、`uni-card`、`uni-forms`、`uni-data-picker`、`uni-nav-bar`、`uni-swipe-action` 等

## 注意事项
- vue-cli 项目 npm 安装 uni-ui 必须安装 `sass` + `sass-loader`；Node < 16 还需在 `vue.config.js` 配置转译
- 多个库同前缀会冲突（例如都用 `u-`），需将其中一方的 easycom 前缀改成其他字母（例如 `a-parse` 替代 `u-parse`）
- uni-ui 基于 Vue 组件实现，在 nvue 原生渲染下需确认组件是否支持
- easycom `autoscan: true` 会扫描 `components/` 目录自动匹配

## 组合提示
- 与 `uni-app-routing` 搭配：easycom 配置写在 `pages.json`，与路由配置同文件
- 与 `uni-app-state-management` 搭配：表单组件的值可绑到 Pinia store 实现跨页复用
