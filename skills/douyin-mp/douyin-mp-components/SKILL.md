---
name: douyin-mp-components
description: "抖音小程序内置组件：视图容器、基础内容、表单、媒体、地图、画布、开放能力（含抖音特有）。"
tech_stack: [douyin-miniprogram]
language: [javascript]
---

# 抖音小程序内置组件（Components）

> 来源：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/component/overview
> 适用：抖音 / 抖音极速版 / 今日头条 / 西瓜视频 等字节系宿主小程序

## 用途

抖音小程序提供 49 个内置组件，覆盖视图容器、基础内容、表单、媒体、地图、画布、开放能力七大类。与微信小程序组件体系高度相似，但**开放能力**与**直播/用户卡片**类组件为抖音特有，且大量高级能力需要后台申请权限。

## 何时使用

- 构建抖音小程序 UI 结构（WXML 风格的 TTML 模板）
- 需要接入直播间跳转、关注抖音号、IM 客服等抖音生态能力
- 排查组件版本兼容与权限申请要求
- 判断某个原生组件是否支持 `cover-view` 层级覆盖

## 通用属性（所有组件可用）

| 属性 | 说明 |
|---|---|
| `id` | 组件唯一标识 |
| `class` | 样式类 |
| `style` | 内联样式（支持数据绑定） |
| `hidden` | 是否隐藏（渲染但不显示） |
| `data-*` | 自定义数据，事件中通过 `e.currentTarget.dataset` 获取 |
| `bind*` / `catch*` | 事件绑定（`catch` 阻止冒泡） |

## 视图容器（8）

| 组件 | 说明 |
|---|---|
| `view` | 通用块级容器，最常用 |
| `scroll-view` | 可滚动区域，`scroll-x` / `scroll-y` 开启方向，`scroll-into-view` 锚点跳转 |
| `swiper` / `swiper-item` | 轮播容器；`autoplay`、`interval`、`circular`、`vertical` |
| `movable-view` / `movable-area` | 可拖动视图，需嵌在 `movable-area` 内 |
| **`mask`（抖音特有）** | 遮罩层组件，用于模态/蒙层场景 |
| `cover-view` | 覆盖在原生组件（video/map/canvas/live-*）之上的文本视图 |
| `cover-image` | 覆盖在原生组件之上的图片 |

**关键点**：原生组件（`video`、`map`、`live-player`、`canvas` 旧版）默认 z-index 最高，普通 `view` 无法覆盖，必须用 `cover-view` / `cover-image`。

## 基础内容（4）

| 组件 | 说明 |
|---|---|
| `text` | 文本，`selectable` 控制可选中，`decode` 解码转义 |
| `icon` | 图标，`type` 支持 success/warn/info/cancel/download/search/clear |
| `progress` | 进度条，`percent`、`show-info`、`active` |
| `rich-text` | 富文本，`nodes` 接受字符串或节点数组，不支持事件绑定 |

## 表单组件（14）

| 组件 | 关键属性 / 说明 |
|---|---|
| `button` | `type`（primary/default/warn）、`size`、`open-type`（见下方特殊能力）、`form-type`（submit/reset） |
| `input` | `type`（text/number/digit/idcard）、`password`、`maxlength`、`confirm-type`；`bindinput` / `bindconfirm` |
| `textarea` | `auto-height`、`maxlength`、`cursor-spacing` |
| `checkbox` / `checkbox-group` | `bindchange` 返回 `detail.value` 数组 |
| `radio` / `radio-group` | 单选，group 内 `bindchange` |
| `picker` | `mode`：selector / multiSelector / time / date / region |
| `picker-view` / `picker-view-column` | 嵌入式滚动选择器 |
| `slider` | `min`、`max`、`step`、`show-value` |
| `switch` | `checked`、`type`（switch/checkbox）、`color` |
| `label` | 通过 `for` 或内嵌关联表单控件 |
| `form` | 搭配 `button form-type="submit"`，`bindsubmit` 收集所有表单控件的 `name` 值 |

## 导航

| 组件 | 说明 |
|---|---|
| `navigator` | `url`、`open-type`（navigate/redirect/switchTab/reLaunch/navigateBack/exit），`target` 可跳转其他小程序 |

## 媒体组件（5）

| 组件 | 说明 |
|---|---|
| `image` | `mode`（scaleToFill/aspectFit/aspectFill/widthFix/heightFix 等）、`lazy-load`、`show-menu-by-longpress` |
| `video` | 原生组件；`src`、`controls`、`autoplay`、`loop`、`muted`、`poster`；事件：`bindplay`/`bindpause`/`bindended`/`bindtimeupdate` |
| `camera` | 原生相机预览；`mode`（normal/scanCode）、`device-position`、`flash` |
| `live-player` | 直播流播放；`src`（rtmp 拉流）、`mode`（live/RTC）、`autoplay`；**通常需后台申请权限** |
| **`live-preview`（抖音特有）** | 直播预览流组件，用于小程序内嵌抖音直播预览 |

## 地图与画布

| 组件 | 说明 |
|---|---|
| `map` | 原生组件；`longitude`/`latitude`、`markers`、`polyline`、`scale`、`show-location` |
| `canvas` | 画布；`type="2d"` 走同层渲染（**v1.59+** 推荐），旧版为原生组件需 `cover-view` 覆盖；`canvas-id` 旧版 API，`type="2d"` 用 `id` |

## 开放能力（5）

| 组件 | 说明 |
|---|---|
| `web-view` | 内嵌 H5 页面；业务域名需在后台配置；只能在独立页面使用 |
| `open-data` | 展示平台信息（如用户昵称、头像），免授权弹窗 |
| `ad` | 广告组件；`unit-id`、`ad-type`（banner/video/interstitial）；需后台申请广告位 |
| **`aweme-user-card`（抖音特有，v2.68.0+）** | 一键关注抖音号卡片；展示抖音用户信息，用户点击可直接关注，需后台绑定抖音号 |
| **`aweme-data`（抖音特有）** | 查询直播间开播状态、用户信息等数据的展示组件 |

## Button `open-type` 特殊能力（抖音生态关键）

`<button open-type="...">` 可触发抖音特有的跨应用能力：

| open-type | 能力 | 备注 |
|---|---|---|
| `openWebcastRoom` | 跳转抖音直播间 | 需配 `data-room-id` 或类似参数 |
| `openAwemeUserProfile` | 跳转抖音用户主页 | 需传抖音号/sec_uid |
| `joinGroup` | 加入粉丝群/抖音群 | 需后台申请并绑定 |
| `privateMessage` | 发起私信 | 需先获用户授权 |
| `authorizePrivateMessage` | 请求私信授权 | 授权后才能调用 `privateMessage` |
| `navigateToVideoView` | **v2.92.0+** 跳转视频详情页 | 传视频 ID |
| `addShortcut` | 添加到我的小程序 | 类似桌面快捷方式 |
| `openSetting` | 打开授权设置页 | 管理小程序权限 |
| `im-customer-service` | 接入 IM 客服 | 需后台配置客服账号 |

通用 `open-type`：`share`（转发）、`getPhoneNumber`、`getUserInfo`、`contact`、`launchApp` 等。

**权限注意**：上述大部分开放能力组件与 open-type 都需要在 **抖音开放平台后台** 申请对应权限或完成抖音号绑定，未申请直接调用会返回错误码。

## 基础用法示例

```html
<!-- index.ttml -->
<view class="page">
  <scroll-view scroll-y style="height: 400rpx" bindscrolltolower="onLoadMore">
    <view wx:for="{{list}}" wx:key="id" class="item">{{item.title}}</view>
  </scroll-view>

  <swiper autoplay circular indicator-dots>
    <swiper-item wx:for="{{banners}}" wx:key="id">
      <image src="{{item.url}}" mode="aspectFill" />
    </swiper-item>
  </swiper>

  <!-- 抖音特有：一键关注抖音号 -->
  <aweme-user-card aweme-id="{{awemeId}}" bind:load="onCardLoad" />

  <!-- 跳转直播间 -->
  <button open-type="openWebcastRoom" data-room-id="{{roomId}}">
    进入直播间
  </button>

  <!-- IM 客服 -->
  <button open-type="im-customer-service">联系客服</button>

  <!-- 表单 -->
  <form bindsubmit="onSubmit">
    <input name="nickname" placeholder="昵称" />
    <button form-type="submit" type="primary">提交</button>
  </form>
</view>
```

## 注意事项

- **原生组件层级**：`video` / `map` / `live-player` / 旧版 `canvas` 等原生组件 z-index 最高，普通 `view` 无法覆盖，必须用 `cover-view` / `cover-image`。新版 `canvas type="2d"` 已走同层渲染（v1.59+），可直接叠加。
- **抖音特有组件不跨平台**：`mask`、`live-preview`、`aweme-user-card`、`aweme-data` 以及 `openWebcastRoom` / `openAwemeUserProfile` 等 open-type 在微信/支付宝小程序中不存在，使用 Taro/uni-app 跨端时需条件编译。
- **权限申请**：`live-player`、`ad`、`aweme-user-card`、`web-view` 业务域名、`joinGroup`、`privateMessage`、`im-customer-service` 等能力都需要在抖音开放平台后台先行申请/配置，否则运行时报错。
- **版本号关注**：`aweme-user-card` 需 v2.68.0+，`navigateToVideoView` 需 v2.92.0+，`canvas type="2d"` 同层渲染需基础库 v1.59+。开发前用 `tt.getSystemInfoSync().SDKVersion` 或 `tt.canIUse()` 做兼容判断。
- **`web-view` 限制**：只能在独立页面使用，业务域名需 ICP 备案并在后台配置白名单；抖音宿主下部分 H5 能力受限。
- **表单提交**：`form` 的 `bindsubmit` 只收集拥有 `name` 属性的表单控件值，缺 `name` 的控件不会被采集。
- **`rich-text` 不支持事件**：内部节点无法绑定 `bindtap`，需要交互时改用普通 `view` + 数据渲染。
- **`picker` 的 region 模式**：返回值为省/市/区三元数组，部分版本字段差异需查文档。

## 组合提示

- 配合 `douyin-mp-core`（项目结构、生命周期、路由、tt 对象总览）建立全局心智
- 配合 `douyin-mp-api`（`tt.*` 调用能力：网络、存储、媒体、登录、支付、直播 API 等）覆盖运行时能力
- 跨端开发参考 `taro` 相关 skill，并关注抖音特有组件的条件编译写法
