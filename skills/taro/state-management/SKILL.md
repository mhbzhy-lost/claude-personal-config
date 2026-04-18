---
name: taro-state-management
description: Taro 中使用 Redux 与 MobX 做全局状态管理：安装、集成、hooks 与常见陷阱
tech_stack: [taro]
language: [javascript, typescript]
capability: [state-management]
version: "mobx 4.8.0 (docs pinned); redux/react-redux unversioned"
collected_at: 2026-04-18
---

# Taro State Management（Taro 状态管理）

> 来源：https://docs.taro.zone/docs/redux, https://docs.taro.zone/docs/mobx/

## 用途
在 Taro 跨端应用中引入 Redux 或 MobX，实现跨页面/组件共享的全局状态管理。

## 何时使用
- 多页面共享用户信息、购物车、主题等全局数据
- 需要可预测、可追踪的状态变更（Redux）
- 偏好响应式、少样板代码的状态管理（MobX）
- 需要持久化全局状态到 Storage

## Redux 用法

### 安装
```bash
npm i redux react-redux redux-thunk redux-logger
```

### 配置 store（`src/store/index.js`）
结合 `redux-thunk`（异步 action）与 `redux-logger`（开发环境日志），按环境条件注入 DevTools。

### 接入 App
```jsx
// src/app.js
import { Provider } from 'react-redux'
import store from './store'

<Provider store={store}><RootPages /></Provider>
```

### 推荐项目结构
- `constants/` — action type 常量
- `actions/` — action creators（同步 + thunk 异步）
- `reducers/` — reducer 函数

### Hooks API
- `useSelector(selector)` — 读取 store 数据
- `useDispatch()` — 获取 dispatch 派发 action
- `useStore()` — 直接拿 store 引用（少用）

### 持久化
使用 `redux-persist` + `redux-persist-taro-storage` 接入 Taro Storage API。

## MobX 用法

### 安装
```bash
npm i mobx@4.8.0 @tarojs/mobx @tarojs/mobx-h5 @tarojs/mobx-rn
```
> 文档锁定 `mobx@4.8.0`，升级到 5/6 前需要验证兼容性。

### 关键 API
- `observer` — 装饰组件，订阅 observable 变化触发重渲染
- `Provider` — 应用入口注入 store，**必须包裹根组件，不可嵌套**
- `inject` — 从 Provider 中抽取 store 到 class 组件 props，**仅支持 class 组件**
- `useLocalStore` — 把普通对象转为 observable（getter → computed，方法自动绑定）
- `useAsObservableSource` — 把外部 props 转为 observable 源
- `onError` — 全局 MobX 异常监听
- `PropTypes` — 提供 `observableArray / observableMap / observableObject` 校验

## 示例（Redux counter 结构）
```js
// constants/counter.js
export const ADD = 'ADD'
export const MINUS = 'MINUS'

// reducers/counter.js 处理 ADD/MINUS，返回 { num } 增减
// actions/counter.js 同步 add/minus + thunk 异步 action
// 组件中用 connect(mapStateToProps, mapDispatchToProps) 绑定
```

## 注意事项
- **MobX JSX 中必须解构 observable 值**：用 `{counter}` 而不是 `{counterStore.counter}`，否则无法追踪依赖
- `@observable` 属性必须给默认值，否则不会被追踪
- 使用 `inject` 的组件必须同时加 `observer` 装饰器
- `Provider`（MobX 与 react-redux 皆然）不能嵌套，必须在根组件处一次注入
- `inject` 仅支持 class 组件；函数组件请用 `useLocalStore` / `useContext`
- Redux 异步请求必须通过 `redux-thunk` 或 `redux-saga` 等中间件，不能直接在 reducer 中发请求

## 组合提示
- 与 `redux-persist-taro-storage` 组合实现持久化
- 与 `taro-request` 搭配：异步 action / MobX store 方法中调用 `Taro.request` 或 axios
