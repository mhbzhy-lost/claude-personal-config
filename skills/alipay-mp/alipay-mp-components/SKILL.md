---
name: alipay-mp-components
description: "支付宝小程序内置组件：视图容器、基础内容、表单、导航、媒体、地图、画布、开放组件。"
tech_stack: [alipay-miniprogram]
language: [javascript]
---

# 支付宝小程序内置组件

> 来源：https://opendocs.alipay.com/mini/component
> 辅助参考：https://www.bookstack.cn/read/alipay-mini/ ， https://www.w3cschool.cn/aliminiapp/
> 版本基准：支付宝小程序基础库 2.x。

## 用途

覆盖支付宝小程序 30+ 个内置组件的关键属性、事件、常见陷阱与代码模板。避免自己用 view + JS 造轮子（如滚动列表、轮播、表单），并了解原生组件的层级限制。

## 何时使用

- 组合页面时选择合适的内置组件（优先官方组件而非手写）
- 需要确认组件支持的属性、事件、回调字段
- 遇到原生组件层级问题（map/video/canvas 遮盖 HTML 元素）
- 从微信 `wx:xxx` 组件迁移到支付宝 `onXxx`

---

## 一、视图容器

### view

基础块级容器，对应 HTML `<div>`。支持 `hover-class`（按下态）、`hover-start-time`、`hover-stay-time`。

```xml
<view class="container" hover-class="container-hover" hover-start-time="50" hover-stay-time="400">
  内容
</view>
```

### scroll-view

可滚动视图。**关键约束**：

- `scroll-x` 和 `scroll-y` **不能同时为 `true`**
- 竖向滚动需要给 scroll-view 一个固定高度（`height: xxxrpx`）
- 横向滚动时子元素需 `display: inline-block` 且父元素 `white-space: nowrap`
- `upper-threshold` / `lower-threshold` 默认 50px（触发 `onScrollToUpper` / `onScrollToLower` 的距离阈值）

```xml
<scroll-view
  scroll-y="{{ true }}"
  style="height: 400rpx;"
  upper-threshold="50"
  lower-threshold="100"
  onScrollToLower="onReachBottom"
  onScroll="onScroll"
  scroll-into-view="{{ targetId }}"
  scroll-with-animation="{{ true }}"
>
  <view a:for="{{ list }}" id="item-{{ index }}">{{ item }}</view>
</scroll-view>
```

常用事件：`onScroll`（参数 `e.detail.scrollTop/scrollLeft`）、`onScrollToUpper`、`onScrollToLower`。

### swiper / swiper-item

轮播。默认 `autoplay=false`、`interval=5000`、`duration=500`、`circular=false`。

```xml
<swiper
  indicator-dots="{{ true }}"
  autoplay="{{ true }}"
  interval="3000"
  duration="500"
  circular="{{ true }}"
  current="{{ current }}"
  onChange="onSwiperChange"
>
  <swiper-item a:for="{{ banners }}">
    <image src="{{ item.url }}" mode="aspectFill" />
  </swiper-item>
</swiper>
```

`onChange(e)` → `e.detail.current`（当前索引）。默认高度 150px，需自己设 `height`。

### movable-view / movable-area

可拖动视图。`movable-view` 必须在 `movable-area` 内，且 `movable-area` 需要明确的 `width/height`。

```xml
<movable-area style="width: 600rpx; height: 600rpx;">
  <movable-view direction="all" x="{{ x }}" y="{{ y }}" inertia damping="20">
    <view class="box" />
  </movable-view>
</movable-area>
```

`direction`：`all` / `vertical` / `horizontal` / `none`。`inertia` 惯性、`out-of-bounds` 是否可越界。

### cover-view / cover-image

覆盖在原生组件之上的视图/图片。用于 map、video、camera、canvas 上叠加文字/按钮。**只能嵌套 cover-view / cover-image**，不能放普通 view。

```xml
<map latitude="{{ lat }}" longitude="{{ lng }}">
  <cover-view class="map-btn" onTap="onLocate">定位</cover-view>
</map>
```

---

## 二、基础内容

### text

行内文本。支持 `selectable`（长按可选中复制）、`space`（`ensp` / `emsp` / `nbsp`，处理空格）、`decode`（解码 HTML 实体）。

```xml
<text selectable="{{ true }}" space="nbsp">
  长按复制：{{ phone }}
</text>
```

**只有 `<text>` 内的内容才会被渲染为文字节点**；`<view>` 里的文本节点在部分平台不可选中。

### icon

内置图标。`type` 取值（9 种）：`success` / `success_no_circle` / `info` / `warn` / `waiting` / `cancel` / `download` / `search` / `clear`。

```xml
<icon type="success" size="46" color="#1677ff" />
```

`size` 单位 px，默认 23。

### progress

进度条。默认 `stroke-width=6`（单位 px）、`color=#09BB07`。`active` 为 `true` 时显示动画。

```xml
<progress percent="{{ 60 }}" stroke-width="8" active="{{ true }}" active-mode="backwards" show-info="{{ true }}" />
```

`active-mode`：`backwards`（每次都从头动画）、`forwards`（只从上次位置动画）。

### rich-text

渲染富文本，通过 `nodes` 数组（推荐）或 HTML 字符串。

```xml
<rich-text nodes="{{ nodes }}" />
```

```javascript
Page({
  data: {
    nodes: [
      {
        name: 'div',
        attrs: { class: 'wrap', style: 'color: red;' },
        children: [
          { type: 'text', text: 'Hello ' },
          { name: 'span', attrs: { style: 'font-weight: bold;' }, children: [{ type: 'text', text: 'World' }] },
        ],
      },
    ],
  },
});
```

HTML 字符串形式可借助 `mini-html-parser2` 转成 nodes。内部不响应事件、不触发 a 链接跳转；需要点击交互请外层包 view。

---

## 三、表单组件

### button

```xml
<button
  type="primary"
  size="default"
  plain="{{ false }}"
  loading="{{ false }}"
  disabled="{{ false }}"
  hover-class="btn-hover"
  onTap="handleTap"
  form-type="submit"
  open-type="share"
>
  提交
</button>
```

- `type`：`default` / `primary` / `warn`
- `size`：`default` / `mini`
- `form-type`：`submit` / `reset`（放在 `<form>` 内）
- `open-type`（开放能力）：
  - `share` — 触发当前页分享
  - `launchApp` — 打开 APP（需绑定）
  - `getAuthorize` — 支付宝授权
  - `lifestyle` — 关注生活号
  - `contactShare` — 分享到好友

### form

```xml
<form onSubmit="onSubmit" onReset="onReset" report-submit="{{ true }}">
  <input name="username" placeholder="用户名" />
  <checkbox-group name="agree">
    <checkbox value="yes">同意协议</checkbox>
  </checkbox-group>
  <button form-type="submit">提交</button>
</form>
```

`onSubmit(e)` → `e.detail.value`（所有带 `name` 的表单组件值）、`e.detail.formId`（开启 `report-submit` 后获得，用于模板消息推送，**7 天有效，每个 formId 最多发 3 次消息**）。

### input

```xml
<input
  type="text"
  value="{{ value }}"
  placeholder="请输入"
  placeholder-class="input-ph"
  maxlength="20"
  focus="{{ focused }}"
  confirm-type="done"
  password="{{ false }}"
  onInput="onInput"
  onConfirm="onConfirm"
  onFocus="onFocus"
  onBlur="onBlur"
/>
```

- `type`：`text` / `number` / `idcard` / `digit`
- `confirm-type`：`done` / `go` / `next` / `search` / `send`
- **受控**：给 `value` 绑定 data + `onInput` 时 setData（否则即非受控模式）
- `onInput` 回调 `e.detail.value`；返回值可作为新 value（合法字符过滤）

### textarea

```xml
<textarea
  value="{{ content }}"
  placeholder="输入内容"
  maxlength="200"
  auto-height="{{ true }}"
  show-count="{{ true }}"
  onInput="onInput"
/>
```

`auto-height` 随内容增高；`show-count` 显示字数统计。**textarea 是原生组件**，z-index 高于普通 view，样式受限。

### checkbox / checkbox-group

```xml
<checkbox-group onChange="onCheckChange">
  <label a:for="{{ items }}">
    <checkbox value="{{ item.value }}" checked="{{ item.checked }}" color="#1677ff" />
    <text>{{ item.name }}</text>
  </label>
</checkbox-group>
```

`onChange(e)` → `e.detail.value`（选中项的 value 数组）。

**受控 vs 非受控**：写 `checked="{{ xxx }}"` 为受控，必须在 `onChange` 中 setData 保持同步；不写则非受控，由组件自行维护状态。

### radio / radio-group

```xml
<radio-group onChange="onRadioChange">
  <label a:for="{{ options }}">
    <radio value="{{ item.value }}" checked="{{ item.value === selected }}" />
    <text>{{ item.name }}</text>
  </label>
</radio-group>
```

`e.detail.value` 为选中项 value（字符串）。

### switch

```xml
<switch checked="{{ on }}" color="#1677ff" onChange="onSwitchChange" />
```

`e.detail.value` 为 `true/false`。

### slider

```xml
<slider
  min="0"
  max="100"
  step="1"
  value="{{ value }}"
  show-value="{{ true }}"
  active-color="#1677ff"
  onChange="onSliderChange"
  onChanging="onSliderChanging"
/>
```

`onChange` 在拖动结束触发，`onChanging` 拖动过程中触发。

### picker（选择器）

支付宝 `picker` 原生 UI，`mode` 支持：`selector`（默认单列）、`multiSelector`（**需要用 picker-view 实现或使用 JSAPI**）、`time`、`date`、`region`。

```xml
<!-- 单列 -->
<picker mode="selector" range="{{ ['苹果','香蕉','橙子'] }}" onChange="onPick">
  <view>当前选择：{{ options[index] }}</view>
</picker>

<!-- 时间 -->
<picker mode="time" value="{{ time }}" start="00:00" end="23:59" onChange="onTimeChange">
  <view>时间：{{ time }}</view>
</picker>

<!-- 日期 -->
<picker mode="date" value="{{ date }}" start="2020-01-01" end="2030-12-31" fields="day" onChange="onDateChange">
  <view>日期：{{ date }}</view>
</picker>
```

`fields`：`year` / `month` / `day`（仅 date 模式）。
**支付宝 picker 对多列（multiSelector）支持较弱，复杂多列建议用 `picker-view` 自行实现**。

### picker-view / picker-view-column

自定义多列选择器。

```xml
<picker-view value="{{ value }}" style="height: 400rpx;" onChange="onPickerViewChange">
  <picker-view-column>
    <view a:for="{{ years }}">{{ item }}年</view>
  </picker-view-column>
  <picker-view-column>
    <view a:for="{{ months }}">{{ item }}月</view>
  </picker-view-column>
</picker-view>
```

`value` 是每列选中索引的数组；`onChange` 的 `e.detail.value` 同样是索引数组。

### label

包裹 input/checkbox/radio/switch 等表单组件，点击 label 即等同点击控件，扩大点击区域。

```xml
<label><checkbox value="a" /> 选项 A</label>
```

---

## 四、导航

### navigator

```xml
<navigator url="/pages/detail/detail?id=1" open-type="navigate" hover-class="nav-hover">
  跳转详情
</navigator>
```

`open-type`：`navigate`（默认，保留当前页）/ `redirect`（关闭当前页）/ `switchTab` / `reLaunch` / `navigateBack`。

**陷阱**：`navigator` 不支持 `onTap` 事件，点击行为由 `url` + `open-type` 驱动。需要附加逻辑时在父元素加 `onTap`，或直接用 `<view onTap>` + `my.navigateTo`。

---

## 五、媒体

### image

```xml
<image
  src="{{ url }}"
  mode="aspectFill"
  lazy-load="{{ true }}"
  default-source="/images/placeholder.png"
  onLoad="onLoad"
  onError="onError"
/>
```

**默认尺寸 320 x 240**（各平台略有差异，部分文档为 300 x 225），必须显式设置 `width/height`。

`mode`（13 种）：

| mode | 说明 |
|------|------|
| `scaleToFill` | 缩放变形撑满（默认） |
| `aspectFit` | 保持宽高比，完整显示（可能留白） |
| `aspectFill` | 保持宽高比，充满容器（可能裁切） |
| `widthFix` | 宽度不变高度自适应 |
| `heightFix` | 高度不变宽度自适应 |
| `top` / `bottom` / `center` / `left` / `right` | 不缩放，只裁切对应位置 |
| `top-left` / `top-right` / `bottom-left` / `bottom-right` | 不缩放，裁切对应角 |

`lazy-load` 仅在 scroll-view / page 内生效。

### video

```xml
<video
  src="{{ videoUrl }}"
  poster="{{ cover }}"
  controls="{{ true }}"
  autoplay="{{ false }}"
  loop="{{ false }}"
  muted="{{ false }}"
  object-fit="contain"
  onPlay="onPlay"
  onPause="onPause"
  onEnded="onEnded"
  onTimeUpdate="onTimeUpdate"
  onError="onError"
/>
```

**支持格式**：mp4、mov、m3u8、flv（部分平台）。`object-fit`：`contain` / `fill` / `cover`。

**原生组件**：层级高于普通 view，遮盖使用 `cover-view` / `cover-image`。

通过 `my.createVideoContext(id)` 获取控制实例：`ctx.play()` / `pause()` / `seek(seconds)` / `requestFullScreen()` / `exitFullScreen()`。

### camera

```xml
<camera device-position="back" flash="auto" onError="onError" style="width: 100%; height: 600rpx;" />
```

通过 `my.createCameraContext()` 获取实例：`ctx.takePhoto({ quality, success })` / `startRecord` / `stopRecord`。

**一个页面只能有一个 camera 组件**。

### lottie

播放 Lottie 动画。**非 web 标准，支付宝专属**。

```xml
<lottie
  id="lottieA"
  path="/lottie/loading.json"
  djangoId=""
  autoplay="{{ true }}"
  speed="{{ 1 }}"
  repeatCount="{{ -1 }}"
  placeholder="/images/placeholder.png"
  assetsPath="/lottie/images/"
  onReady="onReady"
  onFinish="onFinish"
/>
```

- `path` 本地路径；`djangoId` 云端资源 id（二选一）
- `repeatCount`：`-1` 无限循环
- `speed`：播放速度倍率（1 = 原速）
- `assetsPath`：lottie 资源（图片序列等）路径

通过 `my.createLottieContext(id)` 控制：`ctx.play()` / `pause()` / `stop()` / `seek(frame)`。

---

## 六、地图

### map

```xml
<map
  id="map"
  latitude="{{ 39.9 }}"
  longitude="{{ 116.4 }}"
  scale="{{ 16 }}"
  markers="{{ markers }}"
  polyline="{{ polyline }}"
  circles="{{ circles }}"
  include-points="{{ points }}"
  show-location="{{ true }}"
  onMarkerTap="onMarkerTap"
  onRegionChange="onRegionChange"
  style="width: 100%; height: 600rpx;"
/>
```

**关键限制（原生组件）**：

- **层级最高**，普通 view 无法遮盖，需要用 `cover-view` / `cover-image`
- **不能嵌套在 `scroll-view`、`swiper`、`picker-view`、`movable-view` 内**
- **不支持 CSS 动画**（transform、transition 对 map 无效）
- **不支持 CSS 遮罩** 和部分样式

`markers` 数组项示例：

```javascript
{
  id: 1,
  latitude: 39.9,
  longitude: 116.4,
  title: '北京',
  iconPath: '/images/pin.png',
  width: 40,
  height: 40,
  callout: { content: '详情', color: '#000', fontSize: 14, borderRadius: 4, bgColor: '#fff', padding: 8, display: 'ALWAYS' },
}
```

通过 `my.createMapContext('map')` 获取控制实例：`getCenterLocation` / `moveToLocation` / `translateMarker` / `includePoints`。

---

## 七、画布

### canvas

```xml
<canvas id="myCanvas" type="2d" style="width: 750rpx; height: 400rpx;" disable-scroll="{{ true }}" />
```

```javascript
Page({
  onReady() {
    const ctx = my.createCanvasContext('myCanvas');
    ctx.setFillStyle('#1677ff');
    ctx.fillRect(10, 10, 150, 75);
    ctx.draw();
  },
});
```

- `type="2d"` 采用新版 canvas 2d 接口（性能更好），旧接口通过 `my.createCanvasContext` 操作
- 原生组件，层级高于 view；覆盖元素用 `cover-view`
- 导出图片：`my.canvasToTempFilePath({ canvasId, success })`

---

## 八、开放组件

### web-view

在小程序中加载 H5 页面。

```xml
<web-view src="https://example.com/page" onMessage="onWebMessage" onLoad="onLoad" onError="onError" />
```

**重要限制**：

- **仅企业/特殊类目小程序可用**，个人开发者不支持
- **每个页面最多 1 个 web-view**，且 web-view 会自动撑满整个页面（其他内容被覆盖）
- 域名必须加入后台的**业务域名白名单**（需上传校验文件）
- **双向通信**：
  - 小程序 → H5：通过 URL query 传递
  - H5 → 小程序：`my.postMessage({ data })`（H5 侧调用），小程序的 `onMessage` 接收。页面 `navigateBack` / `navigateTo` / 分享时才会触发

H5 页面需引入 `https://appx/web-view.min.js`（支付宝 jsbridge）：

```html
<script src="https://appx/web-view.min.js"></script>
<script>
  my.postMessage({ type: 'ready' });
  my.navigateTo({ url: '/pages/other/other' });
</script>
```

### contact-button

客服会话按钮（需企业资质，**基础库 1.14.1+**）。

```xml
<contact-button
  tnt-inst-id="xxxx"
  scene="SCE00000001"
  size="20"
  color="#1677ff"
>
  联系客服
</contact-button>
```

- `tnt-inst-id`：客服实例 id（由支付宝商户后台配置）
- `scene`：场景码

### lifestyle（关注生活号）

```xml
<lifestyle public-id="2088xxx" onFollow="onFollow">
  <button>关注生活号</button>
</lifestyle>
```

`public-id` 为生活号 ID；点击后触发关注流程，关注结果通过 `onFollow` 返回（`e.detail.success`）。

---

## 与微信小程序差异速查

| 维度 | 支付宝 | 微信 |
|------|-------|------|
| 文件名 | `.axml` / `.acss` | `.wxml` / `.wxss` |
| API | `my.*` | `wx.*` |
| 事件绑定 | `onTap` / `catchTap`（驼峰） | `bindtap` / `catchtap`（小写） |
| 图片默认尺寸 | ~300 x 225 | 320 x 240 |
| picker 多列 | 原生弱，推荐 picker-view | mode="multiSelector" 较完善 |
| map 属性名 | `markers` / `polyline` / `circles` | 相同 |
| web-view 消息 | `my.postMessage` | `wx.miniProgram.postMessage` |
| 组件事件绑定 | 函数 prop（`onXxx="fn"`） | `bind:xxx="fn"` |

---

## 常见陷阱

1. **原生组件层级问题**：`map` / `video` / `canvas` / `camera` / `textarea` / `input`（部分场景）在 iOS 层级最高，普通 view 覆盖无效，必须用 `cover-view` / `cover-image`
2. **scroll-view 高度**：纵向 scroll-view 必须有固定 `height`；否则内容直接撑开不会滚动
3. **scroll-x 与 scroll-y 互斥**：开启其一就关闭另一
4. **swiper 默认高度 150px**：忘记设 `height` 会看不到内容
5. **image 必须设尺寸**：默认 300 x 225 常不符合设计稿，配合 `mode="widthFix"` 或手动指定 `width/height`
6. **form formId**：开启 `report-submit` 才会返回，**7 天过期，每 formId 最多推 3 次**
7. **受控表单**：`input/checkbox/radio/switch` 若写了 `value/checked`，必须在 `onChange/onInput` 中 setData 回写，否则 UI 不更新
8. **navigator 无 onTap**：点击逻辑由 `url` + `open-type` 决定，额外逻辑请用 `view onTap + my.navigateTo`
9. **web-view 独占页面**：加了 web-view 其他组件就不可见；且域名必须白名单
10. **rich-text 内部无事件**：rich-text 内点击不冒泡，无法绑 onTap；需要交互请在外层包 view
11. **lottie 路径限制**：`path` 为本地路径时必须是 `.json`，且图片素材需配合 `assetsPath`
12. **video 不能随意自动播放**：iOS 有系统限制，autoplay 不一定生效；通常需配合用户点击触发 `ctx.play()`

---

## 组合提示

- 配合 `alipay-mp-core` 掌握页面结构和组件定义
- 配合 `alipay-mp-api` 使用 `my.createVideoContext` / `my.createMapContext` / `my.createCanvasContext` 等上下文 API 操作原生组件
- 需要 UI 组件库时优先使用 `mini-ali-ui` 或 `antd-mini`（风格更统一、暗坑更少）
- 跨端（微信 / 支付宝 / 字节）项目建议用 Taro 或 uni-app，而不是直接写双端原生代码
