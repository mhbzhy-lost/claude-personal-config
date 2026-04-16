---
name: jd-mp-components
description: "京东小程序内置组件：视图容器、基础内容、表单、导航、媒体、地图、画布、开放组件。"
tech_stack: [jd-miniprogram]
language: [javascript]
---

# 京东小程序内置组件

> 来源：https://www.bookstack.cn/read/mp-jd-20200423/359654926a192007.md
> 框架：京东小程序（mp-jd），与微信小程序 WXML 组件体系高度相似，但存在若干京东特有限制。

## 用途

在 JDML 模板中使用京东小程序官方内置组件搭建页面。所有组件写法为 `<tag attr="value" bind:event="handler" />`，遵循 Web Component 的 kebab-case 命名。

## 何时使用

- 搭建页面 UI 骨架（view / text / image / scroll-view / swiper）
- 收集用户输入（form / input / textarea / picker / switch / checkbox / radio / slider）
- 承载媒体与原生能力（video / camera / map / live-player）
- 嵌入第三方网页（web-view，仅企业主体）

## 七大类组件速查

### 1. 视图容器

| 组件 | 用途 | 关键属性 |
|---|---|---|
| `view` | 块级容器（首选） | `hover-class`、`hover-start-time`、`hover-stay-time` |
| `scroll-view` | 可滚动区域 | `scroll-x` / `scroll-y`、`scroll-top`、`scroll-into-view`、`bindscrolltolower` |
| `swiper` / `swiper-item` | 轮播 | `current`、`autoplay`、`interval`、`circular`、`bindchange` |
| `movable-view` / `movable-area` | 可拖动视图 | `direction`（all/vertical/horizontal/none）、`x`、`y`、`inertia` |
| `cover-view` / `cover-image` | 覆盖在原生组件上的视图 | 层级高于 map/video/canvas |

**陷阱**：
- `scroll-view` **禁止嵌套** `textarea`、`map`、`canvas`、`video`（原生组件层级冲突）
- `swiper` 的 `bindchange` 回调里**不要频繁 `setData({ current })`**，容易死循环并卡顿
- `movable-view` **必须直接作为 `movable-area` 的子节点**，中间不能有包裹元素
- 需要纵向滚动时，`scroll-view` 必须**显式设置高度**，否则不生效

### 2. 基础内容

| 组件 | 用途 | 关键属性 |
|---|---|---|
| `text` | 文本（唯一支持长按复制） | `selectable`、`space`、`decode` |
| `icon` | 内置图标 | `type`（success/warn/info/cancel/…）、`size`、`color` |
| `progress` | 进度条 | `percent`、`active`、`active-mode`、`stroke-width` |
| `rich-text` | 富文本 | `nodes`（字符串或节点数组） |

**陷阱**：
- 仅 `text` 内部的文字才会响应长按选择，`view` 里的文字不会
- `rich-text` 不支持所有 HTML 标签，脚本标签会被过滤

### 3. 表单

| 组件 | 用途 | 关键属性 |
|---|---|---|
| `button` | 按钮 | `type`（primary/default/warn）、`form-type`（submit/reset）、`open-type`、`loading`、`disabled` |
| `input` | 单行输入（原生组件） | `value`、`type`（text/number/digit/idcard）、`password`、`placeholder`、`maxlength`、`bindinput`、`bindblur` |
| `textarea` | 多行输入（原生组件） | `auto-height`、`fixed`、`cursor-spacing`、`bindlinechange` |
| `form` | 表单容器 | `bindsubmit`、`bindreset`；提交时收集子组件 `name` 属性 |
| `checkbox` / `checkbox-group` | 多选 | 组件自身 `value`、`checked`；group 用 `bindchange` |
| `radio` / `radio-group` | 单选 | 同上 |
| `picker` | 选择器 | `mode`（selector/multiSelector/time/date/region）、`range`、`bindchange` |
| `picker-view` / `picker-view-column` | 嵌入页面的选择器 | `value`、`indicator-style` |
| `slider` | 滑块 | `min`、`max`、`step`、`value`、`show-value`、`bindchange` |
| `switch` | 开关 | `checked`、`type`（switch/checkbox）、`color`、`bindchange` |
| `label` | 关联表单控件 | `for` 属性指向目标 id |

**原生组件陷阱**（`input` / `textarea`）：
- 使用**系统字体**，不支持自定义字体（`font-family` 无效）
- 层级最高，普通 `view` 无法遮挡，需要用 `cover-view` 或条件隐藏
- 部分 CSS 属性不生效（如 `:focus` 伪类、复杂的 `transform`）
- iOS 与 Android 的光标 / placeholder 行为存在差异，建议 placeholder 样式用 `placeholder-style` 或 `placeholder-class`

**form 表单收集规则**：
- `form` 内含 `form-type="submit"` 的 `button` 触发 `bindsubmit`
- 只有设置了 `name` 属性的表单组件的值才会出现在 `e.detail.value` 中

### 4. 导航

- `navigator`：页面跳转。`url`（相对/绝对路径）、`open-type`（navigate/redirect/switchTab/reLaunch/navigateBack）、`hover-class`。跳转 tabBar 页必须用 `switchTab`。

### 5. 媒体

| 组件 | 用途 | 关键属性 |
|---|---|---|
| `image` | 图片 | `src`、`mode`（scaleToFill/aspectFit/aspectFill/widthFix/heightFix/…）、`lazy-load`、`binderror`、`bindload` |
| `video` | 视频（原生组件） | `src`、`controls`、`autoplay`、`loop`、`muted`、`poster`、`object-fit` |
| `camera` | 摄像头（原生组件） | `mode`（normal/scanCode）、`device-position`、`flash`、`bindinitdone` |

**陷阱**：
- `image` 默认宽 320px / 高 240px，未设置尺寸时布局会出现默认值，记得显式写 `width` / `height` 或用 `mode="widthFix"`
- `video` / `camera` 是原生组件，同页面**最多建议 1-2 个**，且层级最高

### 6. 地图

- `map`（原生组件）：`longitude`、`latitude`、`scale`、`markers`、`polyline`、`circles`、`show-location`、`bindmarkertap`、`bindregionchange`。与 `scroll-view` / `swiper` 嵌套要使用 `cover-view` 做覆盖层。

### 7. 画布

- `canvas`：**京东小程序对 Canvas 的支持有限**，部分版本仅提供基础 2D 能力，不建议作为核心渲染方案；复杂图表优先走服务端渲图或 `image` 展示。使用前务必在目标机型上回归。

### 8. 开放组件

- `web-view`：加载 H5 页面。
  - **每个页面最多 1 个** `web-view`
  - `src` 必须在**开发者后台配置业务域名白名单**
  - **仅企业主体小程序**可用，个人主体不支持
  - 可通过 `bindmessage` 接收 H5 postMessage；H5 端通过 `jdjs-sdk` 调用小程序能力

## 通用属性（所有组件都支持）

| 属性 | 说明 |
|---|---|
| `id` | 节点 id，全局唯一 |
| `class` | 样式类 |
| `style` | 内联样式，支持 `{{}}` 绑定动态值 |
| `hidden` | 布尔值，隐藏节点（仍占位参与 diff，不同于 `wx:if` 移除） |
| `data-*` | 自定义数据，事件回调中 `e.currentTarget.dataset` 读取 |
| `bind:*` / `catch:*` | 事件绑定；`catch` 阻止冒泡 |

## 组件命名规范

- 所有内置组件名**全小写**，多词用中划线（kebab-case），如 `scroll-view`、`cover-image`
- 自定义组件同样遵循此规范，且文件名、标签名、`usingComponents` 中 key 必须一致

## 基础用法示例

```xml
<!-- pages/demo/demo.jdml -->
<view class="page">
  <scroll-view scroll-y style="height: 400rpx;" bindscrolltolower="loadMore">
    <view wx:for="{{list}}" wx:key="id" class="row">{{item.title}}</view>
  </scroll-view>

  <form bindsubmit="onSubmit">
    <input name="nick" placeholder="昵称" bindinput="onInput" />
    <picker name="city" mode="selector" range="{{cities}}" bindchange="onPick">
      <view>{{cities[cityIdx]}}</view>
    </picker>
    <button form-type="submit" type="primary">提交</button>
  </form>

  <image src="{{cover}}" mode="widthFix" lazy-load />
</view>
```

## 常见陷阱汇总

- **原生组件层级最高**：`input` / `textarea` / `video` / `map` / `camera` / `canvas` 无法被普通 `view` 遮挡，弹窗遮罩必须用 `cover-view` / `cover-image`，或切换 `hidden`
- **scroll-view 嵌套限制**：不能内嵌 textarea / map / canvas / video
- **swiper bindchange**：避免循环 setData，建议用局部变量缓存
- **web-view 企业专属**：规划前务必确认主体类型
- **样式单位**：优先用 `rpx`（1rpx = 屏宽/750），保证多机型适配
- **事件冒泡**：`bindtap` 冒泡，`catchtap` 不冒泡；列表项需要阻止冒泡时使用 `catch:`

## 组合提示

配合 `jd-mp-core`（项目结构、配置、生命周期）、`jd-mp-api`（wx.* 等 API）形成最小闭环。需要更复杂交互时，封装自定义组件而非堆叠内置组件。
