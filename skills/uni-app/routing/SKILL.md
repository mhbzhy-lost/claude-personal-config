---
name: uni-app-routing
description: uni-app 页面路由、pages.json 配置与跨页通信核心用法
tech_stack: [uni-app]
language: [javascript]
capability: [routing]
version: "uni-app unversioned"
collected_at: 2026-04-18
---

# uni-app 路由与页面配置

> 来源：https://uniapp.dcloud.net.cn/api/router、https://uniapp.dcloud.net.cn/collocation/pages.html

## 用途
统一跨端（App/H5/各类小程序）的页面栈管理、页面注册、tabBar 与跨页通信。

## 何时使用
- 新建页面并在 `pages.json` 中注册路径与窗口样式
- 在页面间跳转、传参或回退
- 配置底部 tabBar、分包、easycom 自动引入
- 跨页面事件通信（全局事件或指定目标页事件）

## 基础用法

```javascript
// 保留当前页，跳转并传参
uni.navigateTo({ url: 'test?id=1&name=uniapp' });

// 目标页在 onLoad 接收参数
export default {
  onLoad(options) {
    console.log(options.id, options.name);
  }
}
```

`pages.json` 基本结构：

```json
{
  "pages": [
    { "path": "pages/index/index", "style": { "navigationBarTitleText": "首页" } }
  ],
  "globalStyle": { "navigationBarBackgroundColor": "#fff" },
  "tabBar": {
    "color": "#999", "selectedColor": "#007aff", "backgroundColor": "#fff",
    "list": [ { "pagePath": "pages/index/index", "text": "首页" } ]
  },
  "easycom": {
    "autoscan": true,
    "custom": { "^uni-(.*)": "@dcloudio/uni-ui/lib/uni-$1/uni-$1.vue" }
  }
}
```

## 关键 API（摘要）
- `uni.navigateTo({ url, events?, animationType?, animationDuration? })`：入栈跳转，非 tabBar 页
- `uni.redirectTo({ url })`：关闭当前页再跳转，不入栈
- `uni.reLaunch({ url })`：清空页面栈后打开新页面
- `uni.switchTab({ url })`：跳转到 tabBar 页并关闭其他非 tabBar 页
- `uni.navigateBack({ delta })`：返回 N 层，默认 1
- `getCurrentPages()`：返回页面栈数组，末尾为当前页
- `getApp()`：获取 app 实例与 `globalData`
- `uni.$emit / $on / $once / $off`：全局事件总线
- `EventChannel`（`navigateTo` 的 `events` 参数）：被打开页与打开页双向通信
- `pages.json` 顶层字段：`pages` `globalStyle` `tabBar` `subPackages` `easycom` `preloadRule` `condition`

页面生命周期：`onLoad`（接参）→`onShow`→`onReady`→`onHide`→`onUnload`，以及 `onPullDownRefresh`、`onReachBottom`、`onPageScroll`。

## 注意事项
- 首页 `onReady` 之前不能调用导航 API
- URL 参数长度受限；大数据走 `EventChannel` 或全局事件，别塞进 query
- 参数特殊字符必须 `encodeURIComponent`
- tabBar 最多 5 个、最少 2 个；跳 tabBar 页必须用 `switchTab`
- `uni.$on` 务必在 `onUnload` 里 `$off` 清理，防内存泄漏
- `pages.json` 中 `pages` 数组第一项即应用首页
- `easycom` 要求组件路径形如 `components/组件名/组件名.vue` 才能免注册

## 组合提示
- 与 `uni-app-state-management` 搭配：跨页共享状态用 Pinia/Vuex，临时一次性数据用 `EventChannel`
- 与 `uni-app-ui-libraries` 搭配：easycom 配置同样写在 `pages.json`
