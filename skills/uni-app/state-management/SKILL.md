---
name: uni-app-state-management
description: uni-app 下的 Pinia、Vuex 与本地 Storage API 状态管理方案
tech_stack: [uni-app]
language: [javascript]
capability: [state-management, local-storage]
version: "uni-app unversioned; pinia 2.0.36 (HBuilderX<4.14)"
collected_at: 2026-04-18
---

# uni-app 状态管理

> 来源：https://uniapp.dcloud.net.cn/tutorial/vue3-pinia.html、vue-vuex.html、api/storage/storage

## 用途
在 uni-app 项目中按需选择 Pinia（Vue 3 推荐）、Vuex（Vue 2）或 `uni.storage` 本地缓存实现跨组件/跨页面状态共享与持久化。

## 何时使用
- Vue 3 项目的全局状态共享 → Pinia
- Vue 2 项目或老代码迁移 → Vuex
- 需要跨启动持久化的数据（token、用户偏好）→ `uni.setStorage*`
- 小项目或仅局部 props 下传场景则不必引入状态管理

## 基础用法

**Pinia（Vue 3）**：HBuilderX 创建的项目已内置，CLI 安装见"注意事项"。

```javascript
// main.js
import { createSSRApp } from 'vue';
import * as Pinia from 'pinia';
export function createApp() {
  const app = createSSRApp(App);
  app.use(Pinia.createPinia());
  return { app, Pinia };
}

// stores/counter.js
import { defineStore } from 'pinia';
export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
  actions: { increment() { this.count++; } }
});

// 组件中
const counter = useCounterStore();
counter.increment();
counter.$patch({ count: counter.count + 1 });
```

**Storage**：

```javascript
uni.setStorageSync('token', 'abc');
const token = uni.getStorageSync('token');
uni.removeStorageSync('token');
```

## 关键 API（摘要）
- Pinia：`defineStore(id, { state, getters, actions })`、`$patch`、`$reset`、`mapStores/mapState/mapActions`
- Vuex：`state` / `getters` / `mutations`（同步，`commit`）/ `actions`（异步，`dispatch`）/ `modules`；辅助函数 `mapState/mapGetters/mapMutations/mapActions`
- 异步存储：`uni.setStorage/getStorage/removeStorage/clearStorage/getStorageInfo`（带 `success/fail/complete`）
- 同步存储：`uni.setStorageSync(key, data)`、`getStorageSync(key)`、`removeStorageSync`、`clearStorageSync`、`getStorageInfoSync()`

## 注意事项
- Pinia 仅支持 Vue 3；Vue 2 项目请用 Vuex
- CLI 创建的项目，HBuilderX < 4.14 必须锁版本 `yarn add pinia@2.0.36`；≥ 4.14 可直接 `yarn add pinia`
- Mutation 必须同步，异步逻辑放 Action（Vuex 规则）
- Storage 仅能存 JSON 可序列化数据；以 `uni-`、`uni_`、`dcloud-`、`dcloud_` 开头的 key 为保留字
- H5 走 `localStorage`（5MB 上限）；微信小程序单 key ≤ 1MB、总容量 10MB
- 非 App 平台上 `uni.clearStorage` 会导致 `uni.getSystemInfo` 返回的设备 ID 发生变化

## 组合提示
- 与 `uni-app-routing` 搭配：跨页共享状态用 store，一次性参数走 query / `EventChannel`
- 与 `uni-app-request` 搭配：token 可存 Storage，并在 request 拦截器中自动注入 header
