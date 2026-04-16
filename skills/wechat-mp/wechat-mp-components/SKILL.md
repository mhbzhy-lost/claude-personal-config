---
name: wechat-mp-components
description: "微信小程序内置组件：视图容器、基础内容、表单、导航、媒体、地图、画布、开放能力组件。"
tech_stack: [wechat-miniprogram]
language: [javascript]
---

# 微信小程序内置组件（30 个）

> 来源：https://developers.weixin.qq.com/miniprogram/dev/component/
> 版本基准：基础库 2.x+（特性出现版本会在条目处单独标注）。

## 用途

微信小程序 UI 的搭建基石。所有页面由内置组件（非 HTML 标签）拼装而成，覆盖布局容器、交互控件、媒体、地图、画布和微信平台开放能力。

## 何时使用

- 构建页面布局与滚动区域（`view` / `scroll-view` / `swiper`）
- 处理用户输入与表单（`input` / `picker` / `form` + `button form-type="submit"`）
- 展示图片、视频、音视频直播、相机预览等富媒体
- 接入开放能力（联系客服、分享、获取手机号、获取头像）
- 嵌入 H5 页面（`web-view`）、绘制图形（`canvas`）、渲染地图（`map`）

## 通用属性（所有组件都有）

| 属性 | 说明 |
|------|------|
| `id` / `class` / `style` | 标识与样式 |
| `hidden` | `true` 时隐藏（等价 `display:none`，不卸载节点） |
| `data-*` | 自定义数据，事件中通过 `e.currentTarget.dataset` 读取 |
| `bind:事件` / `catch:事件` | 冒泡 / 阻止冒泡；还有 `mut-bind:`（互斥，2.8.2+）和 `capture-bind:`（捕获阶段） |

---

## 一、视图容器（7 个）

### `view`

最基础容器，等价于 `div`，支持点击态。

```xml
<view class="container" hover-class="pressed" hover-stay-time="400">
  内容
</view>
```

| 属性 | 默认 | 说明 |
|------|------|------|
| `hover-class` | `none` | 按下时附加样式类，`none` 表示不启用 |
| `hover-stop-propagation` | `false` | 阻止祖先出现点击态 |
| `hover-start-time` | 50 | 按住多久出现点击态（ms） |
| `hover-stay-time` | 400 | 松开后点击态保留时间（ms） |

### `scroll-view`

可滚动视图。2.12.0+ 支持 `type="list"` 虚拟滚动。

```xml
<scroll-view scroll-y style="height: 300px;"
  bindscrolltolower="loadMore"
  refresher-enabled bindrefresherrefresh="onRefresh">
  <view wx:for="{{list}}" wx:key="id">{{item.name}}</view>
</scroll-view>
```

| 属性 | 说明 |
|------|------|
| `scroll-x` / `scroll-y` | 横/纵滚动；`scroll-y` **必须设固定高度** |
| `scroll-top` / `scroll-left` | 设置滚动位置 |
| `scroll-into-view` | 滚动到子元素 id（id **不能数字开头**） |
| `scroll-with-animation` | 滚动过渡动画 |
| `upper-threshold` / `lower-threshold` | 触发顶/底事件的距离（默认 50） |
| `refresher-enabled` / `refresher-triggered` | 下拉刷新开关/状态 |
| `type="list"` | 2.12.0+ 虚拟滚动，超长列表性能救星 |
| `bindscrolltolower` / `bindscrolltoupper` | 触底/触顶 |
| `bindrefresherrefresh` | 下拉刷新触发 |

**陷阱**：横向滚动时子元素需 `display: inline-block` 或 flex；漏掉高度是最常见 bug。

### `swiper` / `swiper-item`

轮播容器。

```xml
<swiper indicator-dots autoplay circular interval="3000"
  bindchange="onSwiperChange">
  <swiper-item wx:for="{{banners}}" wx:key="id">
    <image src="{{item.url}}" mode="aspectFill" />
  </swiper-item>
</swiper>
```

常用属性：`indicator-dots` / `indicator-color` / `indicator-active-color` / `autoplay` / `interval`（默认 5000）/ `duration`（默认 500）/ `circular` / `vertical` / `current` / `bindchange`（`e.detail.current`）。

**陷阱**：`swiper` 默认高度 150px，**必须显式设置高度**。

### `movable-area` / `movable-view`

拖拽容器。`movable-view` 必须为 `movable-area` 的直接子节点。

```xml
<movable-area style="width: 300px; height: 300px;">
  <movable-view direction="all" x="{{x}}" y="{{y}}" bindchange="onMove">
    拖我
  </movable-view>
</movable-area>
```

`movable-view` 关键属性：`direction`（`all` / `vertical` / `horizontal` / `none`）、`inertia`、`out-of-bounds`、`damping`（默认 20）、`x` / `y`。

### `cover-view` / `cover-image`

覆盖在原生组件（`map` / `video` / `canvas` / `camera` / `live-player`）之上的视图。

```xml
<video src="{{videoUrl}}">
  <cover-view class="controls">
    <cover-image src="/images/play.png" />
  </cover-view>
</video>
```

**限制**：子节点只能嵌套 `cover-view` / `cover-image` / `button`；仅支持有限 CSS；2.4.0+ 多数场景可用「同层渲染」替代。

### `match-media`

媒体查询容器：屏幕满足条件时才渲染子节点。

```xml
<match-media min-width="375" orientation="portrait">
  <view>大屏竖屏才渲染</view>
</match-media>
```

属性：`min-width` / `max-width` / `min-height` / `max-height`（px）、`orientation`（`landscape` / `portrait`）。

### `page-container`

官方推荐的半屏弹窗容器，带过渡动效并能拦截系统返回。

```xml
<page-container show="{{show}}" position="bottom"
  overlay round close-on-slide-down
  bindafterleave="onClose">
  <view class="sheet">弹窗内容</view>
</page-container>
```

属性：`show`（必填）、`position`（`top` / `bottom` / `right` / `center`）、`overlay`、`round`、`close-on-slide-down`、`duration`（默认 300）。

---

## 二、基础内容（4 个）

### `icon`

内置图标，9 种 `type`：`success` / `success_no_circle` / `info` / `warn` / `waiting` / `cancel` / `download` / `search` / `clear`。

```xml
<icon type="success" size="23" color="#09BB07" />
```

### `text`

文本组件。**只有 `<text>` 内的文本可被长按选中**；是行内元素。

```xml
<text user-select>长按可选中复制</text>
<text space="ensp">文 字 之 间 留 半 角 空 格</text>
<text decode>&gt; &lt; &amp;</text>
```

| 属性 | 说明 |
|------|------|
| `user-select` | 可选中（长按复制），2.12.1+ |
| `space` | `ensp` / `emsp` / `nbsp` |
| `decode` | 解码 HTML 实体 |

**陷阱**：`<text>` 内**只能嵌套 `<text>`**，不能塞 `view` / `image` 等其他组件。

### `rich-text`

富文本，支持 HTML 字符串或节点数组。

```xml
<!-- 字符串（解析慢，XSS 风险高） -->
<rich-text nodes="<h1>标题</h1><p style='color:red'>段落</p>" />

<!-- 节点数组（推荐） -->
<rich-text nodes="{{nodes}}" />
```

```js
data: {
  nodes: [
    { name: 'h1', children: [{ type: 'text', text: '标题' }] },
    { name: 'p', attrs: { style: 'color:red' },
      children: [{ type: 'text', text: '段落' }] }
  ]
}
```

**限制**：内部节点不支持事件绑定；支持的标签白名单有限（`div` / `p` / `h1-h6` / `a` / `img` / `br` / `hr` / `span` / `table` 等）。

### `progress`

进度条。

```xml
<progress percent="80" show-info stroke-width="6"
  activeColor="#09BB07" backgroundColor="#eee"
  active active-mode="forwards" />
```

`active-mode`：`backwards`（每次从 0 开始） / `forwards`（从上次结束位置继续）。

---

## 三、表单组件（9 个）

### `button`

按钮。核心价值是 `open-type` 打通微信开放能力。

```xml
<button type="primary" bindtap="onSubmit">提交</button>
<button open-type="contact">联系客服</button>
<button open-type="share">分享给朋友</button>
<button open-type="getPhoneNumber" bindgetphonenumber="onGetPhone">获取手机号</button>
<button open-type="chooseAvatar" bindchooseavatar="onChooseAvatar">选择头像</button>
```

基础属性：`type`（`primary` 绿 / `default` 白 / `warn` 红）、`size`（`default` / `mini`）、`plain`、`disabled`、`loading`、`form-type`（`submit` / `reset`）。

**open-type 完整列表**：

| open-type | 触发事件 | 说明 |
|-----------|---------|------|
| `contact` | `bindcontact` | 打开客服会话（需配置客服） |
| `share` | — | 触发用户转发（等同页面 `onShareAppMessage`） |
| `getPhoneNumber` | `bindgetphonenumber` | 获取用户手机号（需实名/企业主体） |
| `getUserInfo` | `bindgetuserinfo` | **已废弃**，改用 `wx.getUserProfile`（旧基础库）或昵称/头像填写 |
| `launchApp` | `bindlauncherror` | 打开关联 APP |
| `openSetting` | `bindopensetting` | 打开授权设置页 |
| `feedback` | — | 打开意见反馈页 |
| `chooseAvatar` | `bindchooseavatar` | 获取用户头像（替代旧的 `getUserInfo`） |
| `agreePrivacyAuthorization` | `bindagreeprivacyauthorization` | 同意隐私协议（2.32.3+） |

**获取手机号流程**（返回 code，服务端换取手机号）：

```js
onGetPhone(e) {
  if (e.detail.errMsg !== 'getPhoneNumber:ok') return;
  const { code } = e.detail;
  wx.request({ url: '/api/phone', method: 'POST', data: { code } });
}
```

### `input`

单行输入框。

```xml
<input type="text" placeholder="请输入用户名"
  confirm-type="next" maxlength="20"
  bindinput="onInput" bindconfirm="onConfirm" />
<input type="number" placeholder="纯数字" />
<input type="digit" placeholder="带小数点" />
<input type="idcard" placeholder="身份证号" />
<input type="nickname" placeholder="微信昵称" />
<input password placeholder="密码" />
```

| 属性 | 说明 |
|------|------|
| `type` | `text` / `number` / `idcard` / `digit` / `nickname`（2.21.2+） |
| `password` | 密码输入 |
| `maxlength` | 最大长度，`-1` 不限 |
| `confirm-type` | 键盘右下角按钮：`send` / `search` / `next` / `go` / `done` |
| `focus` / `auto-focus` | 自动聚焦 |
| `bindinput` | 输入时触发，`e.detail.value`；**return 新值可改写输入值（会导致光标跳末尾）** |
| `bindconfirm` | 点击完成 |
| `bindfocus` / `bindblur` | 焦点变化 |

### `textarea`

多行输入，属性大部分与 `input` 相同。

```xml
<textarea placeholder="详细描述" maxlength="500"
  auto-height bindinput="onInput" bindlinechange="onLineChange" />
```

特有属性：`auto-height`、`show-confirm-bar`（默认 `true`）、`bindlinechange`。

### `picker`

滚动选择器，5 种 mode。

```xml
<picker mode="selector" range="{{cities}}" bindchange="onPick">
  <view>{{cities[index] || '请选择'}}</view>
</picker>

<picker mode="multiSelector" range="{{multiRange}}"
  bindchange="onMultiChange" bindcolumnchange="onColumnChange">
  <view>{{selected}}</view>
</picker>

<picker mode="date" start="2020-01-01" end="2030-12-31"
  value="{{date}}" bindchange="onDate">
  <view>{{date || '选择日期'}}</view>
</picker>

<picker mode="time" start="09:00" end="18:00" bindchange="onTime">
  <view>{{time}}</view>
</picker>

<picker mode="region" bindchange="onRegion">
  <view>{{region.join(' ')}}</view>
</picker>
```

| mode | 关键属性 | 返回 |
|------|---------|------|
| `selector` | `range`, `range-key`（对象数组用） | `e.detail.value` 为 index |
| `multiSelector` | `range`（二维数组） | `e.detail.value` 为 index 数组 |
| `time` | `start`, `end`（HH:mm） | `e.detail.value` 字符串 |
| `date` | `start`, `end`, `fields`（`year`/`month`/`day`） | `e.detail.value` 字符串 |
| `region` | `custom-item`（自定义首项） | `e.detail.value` 数组 + `e.detail.code` 区划码 |

### `form`

表单容器，收集带 `name` 的内部组件。

```xml
<form bindsubmit="onSubmit" bindreset="onReset" report-submit>
  <input name="username" placeholder="用户名" />
  <switch name="agree" />
  <button form-type="submit">提交</button>
  <button form-type="reset">重置</button>
</form>
```

```js
onSubmit(e) {
  console.log(e.detail.value);   // { username: '...', agree: true }
  // e.detail.formId：report-submit=true 时返回，模板消息已废弃、改用订阅消息
}
```

**陷阱**：子组件必须设 `name` 才会被收集。

### `checkbox` / `checkbox-group`

```xml
<checkbox-group bindchange="onCheck">
  <label wx:for="{{options}}" wx:key="value">
    <checkbox value="{{item.value}}" checked="{{item.checked}}" />{{item.label}}
  </label>
</checkbox-group>
```

`e.detail.value` 是选中 `value` 组成的**数组**。

### `radio` / `radio-group`

```xml
<radio-group bindchange="onRadio">
  <label wx:for="{{options}}" wx:key="value">
    <radio value="{{item.value}}" />{{item.label}}
  </label>
</radio-group>
```

`e.detail.value` 是选中 radio 的 **value 字符串**。

### `slider`

```xml
<slider min="0" max="100" step="5" value="{{v}}"
  show-value bindchange="onSlider" activeColor="#1aad19" />
```

### `switch`

```xml
<switch checked="{{enabled}}" type="switch"
  color="#09BB07" bindchange="onSwitch" />
```

`type`：`switch`（滑块）/ `checkbox`（勾选样式）。

---

## 四、导航

### `navigator`

页面跳转声明式组件，`wx.navigateTo` 等 API 的模板版。

```xml
<navigator url="/pages/detail/detail?id=123">详情</navigator>
<navigator url="/pages/tab/index" open-type="switchTab">首页</navigator>
<navigator url="/pages/login/login" open-type="redirect">登录（替换）</navigator>
<navigator open-type="navigateBack" delta="1">返回</navigator>
```

| open-type | 等价 API | 说明 |
|-----------|---------|------|
| `navigate`（默认） | `wx.navigateTo` | 保留当前页 |
| `redirect` | `wx.redirectTo` | 关闭当前页 |
| `switchTab` | `wx.switchTab` | 跳 tabBar 页（**不能带 query**） |
| `reLaunch` | `wx.reLaunch` | 关闭所有页 |
| `navigateBack` | `wx.navigateBack` | 返回上一页（`delta` 控制层数） |
| `exit` | — | 退出小程序（跳其他小程序时） |

**陷阱**：页面栈最多 **10 层**，超过后 `navigateTo` 会失败；`switchTab` URL 不支持参数。

---

## 五、媒体组件（6 个）

### `image`

图片。**默认尺寸 320×240**（必记）。

```xml
<image src="{{url}}" mode="aspectFill"
  lazy-load show-menu-by-longpress
  binderror="onErr" bindload="onLoad" />
```

| 属性 | 说明 |
|------|------|
| `src` | 本地 / 网络 / base64 / `cloud://` |
| `mode` | 缩放裁剪模式（13 种，见下） |
| `lazy-load` | 懒加载（**仅在页面或 `scroll-view` 内生效**） |
| `show-menu-by-longpress` | 长按弹「识别小程序码 / 保存图片」菜单 |
| `webp` | 支持 webp（默认 `false`） |
| `bindload` | `e.detail = { width, height }` |
| `binderror` | 加载失败 |

**mode 取值（常用加粗）**：
- **`scaleToFill`**（默认，拉伸，会变形）
- **`aspectFit`**（等比缩放，完整显示，可能留白）
- **`aspectFill`**（等比缩放短边填满，裁剪长边，**列表最常用**）
- **`widthFix`**（宽固定，高按比例自适应，**文章图最常用**）
- `heightFix`（高固定，宽自适应）
- `top` / `bottom` / `left` / `right` / `center`：不缩放，显示指定位置
- `top left` / `top right` / `bottom left` / `bottom right`：不缩放，显示指定角

### `video`

视频播放。原生组件，层级最高（或启用同层渲染）。

```xml
<video id="myVideo" src="{{videoUrl}}" poster="{{cover}}"
  controls autoplay="{{false}}" muted="{{false}}"
  object-fit="contain"
  bindplay="onPlay" bindpause="onPause" bindended="onEnded"
  bindtimeupdate="onTime" bindfullscreenchange="onFS" />
```

| 属性 | 说明 |
|------|------|
| `src` / `poster` | 视频地址 / 封面 |
| `controls` | 显示默认控件（默认 `true`） |
| `autoplay` / `loop` / `muted` | 常规开关 |
| `object-fit` | `contain` / `fill` / `cover` |
| `direction` | 全屏旋转：`0` / `90` / `-90` |
| `enable-play-gesture` | 双击切换播放 |
| `picture-in-picture-mode` | `push` / `pop`（画中画，2.15.0+） |
| `enable-drm` | DRM 加密播放 |
| `bindtimeupdate` | 每 250ms 触发 |

**JS 控制**：

```js
const ctx = wx.createVideoContext('myVideo');
ctx.play(); ctx.pause(); ctx.seek(30);
ctx.requestFullScreen({ direction: 0 });
```

### `camera`

系统相机。需授权 `scope.camera`。

```xml
<camera device-position="back" flash="auto"
  bindscancode="onScan" binderror="onErr"
  style="width:100%; height:300px;" />
```

```js
const ctx = wx.createCameraContext();
ctx.takePhoto({ quality: 'high', success: res => console.log(res.tempImagePath) });
ctx.startRecord({ success: res => console.log(res.tempVideoPath) });
```

### `live-player`（直播拉流）

```xml
<live-player src="{{rtmpUrl}}" mode="live" autoplay
  orientation="vertical" object-fit="contain"
  bindstatechange="onState"
  style="width:100%; height:300px;" />
```

`mode`：`live`（直播）/ `RTC`（实时通话）。

**资质要求**：仅限特定类目小程序（社交、教育、医疗、金融等），需在后台申请。

### `live-pusher`（直播推流）

```xml
<live-pusher url="{{pushUrl}}" mode="RTC"
  autopush beauty="5" whiteness="3" aspect="3:4"
  bindstatechange="onState" />
```

同样**需类目资质**方可使用。

---

## 六、地图

### `map`

原生组件，层级最高。需在 `project.config.json` 的小程序后台配置「地图」接口权限；如需自定义地图或增强能力，还要配置腾讯地图 `subkey`。

```xml
<map id="myMap"
  latitude="{{lat}}" longitude="{{lng}}"
  scale="16" show-location
  markers="{{markers}}" polyline="{{polyline}}"
  circles="{{circles}}"
  bindmarkertap="onMarkerTap" bindregionchange="onRegionChange"
  style="width:100%; height:400px;" />
```

| 属性 | 说明 |
|------|------|
| `latitude` / `longitude` | 中心点 |
| `scale` | 3–20，默认 16 |
| `show-location` | 显示定位点（蓝点） |
| `markers` / `polyline` / `circles` / `polygons` | 覆盖物数组 |
| `include-points` | 自动缩放以包含所有点 |
| `bindmarkertap` / `bindregionchange` / `bindcallouttap` | 交互事件 |

**marker 结构（最常用字段）**：

```js
markers: [{
  id: 1, latitude: 39.908, longitude: 116.397,
  title: '天安门',
  iconPath: '/images/marker.png', width: 30, height: 30,
  callout: { content: '天安门广场', display: 'ALWAYS',
             borderRadius: 5, padding: 10 }
}]
```

**polyline 结构**：

```js
polyline: [{
  points: [{ latitude: 39.908, longitude: 116.397 },
           { latitude: 39.916, longitude: 116.403 }],
  color: '#FF0000', width: 4, dottedLine: false
}]
```

**JS 控制**：

```js
const mapCtx = wx.createMapContext('myMap');
mapCtx.moveToLocation();
mapCtx.getCenterLocation({ success: res => console.log(res) });
mapCtx.includePoints({ points: [...], padding: [20] });
```

---

## 七、画布

### `canvas`

推荐 `type="2d"`（新接口，API 贴近 Web Canvas）。

```xml
<canvas type="2d" id="myCanvas" style="width: 300px; height: 300px;" />
```

```js
wx.createSelectorQuery()
  .select('#myCanvas').fields({ node: true, size: true })
  .exec(res => {
    const canvas = res[0].node;
    const ctx = canvas.getContext('2d');

    // 适配高清屏
    const dpr = wx.getWindowInfo().pixelRatio;
    canvas.width = res[0].width * dpr;
    canvas.height = res[0].height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#FF0000';
    ctx.fillRect(10, 10, 100, 100);
    ctx.font = '16px sans-serif';
    ctx.fillText('Hello', 20, 60);
  });
```

**导出图片**：

```js
wx.canvasToTempFilePath({
  canvas,  // 2D 模式传 canvas 节点（旧模式传 canvasId）
  success: res => wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath })
});
```

| type | 说明 |
|------|------|
| `2d` | Web 标准 2D API（推荐） |
| `webgl` | 3D / WebGL |
| 不填 | 旧接口 `wx.createCanvasContext`（**不推荐，已停止维护**） |

**限制**：
- 最大尺寸约 **1365 × 1365** 像素（各设备不同，超出会白屏或报错）
- 原生组件，覆盖内容需 `cover-view` 或启用同层渲染
- `type="2d"` 不兼容旧版 `wx.createCanvasContext`

---

## 八、开放能力组件

### `open-data`

展示微信开放数据（无需授权），但隐私政策收紧后绝大多数类型**已废弃**。

| type | 状态 |
|------|------|
| `groupName` | 有效（需 `open-gid`，仅分享到群的场景） |
| `userNickName` / `userAvatarUrl` / `userGender` / `userCity` / `userProvince` / `userCountry` / `userLanguage` | **全部废弃**（昵称返回"微信用户"，头像返回灰头像） |

**替代方案**：
- 头像：`<button open-type="chooseAvatar">`
- 昵称：`<input type="nickname">`
- 手机号：`<button open-type="getPhoneNumber">`

### `web-view`

嵌入网页，**全屏**展示，不能与其他组件并列。

```xml
<web-view src="https://example.com/h5"
  bindmessage="onH5Msg" bindload="onLoad" binderror="onErr" />
```

**限制**：
- **域名白名单**：`src` 域名必须在「小程序后台 → 开发管理 → 开发设置 → 业务域名」中配置，并放置校验文件
- 自动铺满整个页面，页面内不允许再放别的组件
- **个人类型小程序不支持** `web-view`
- 不支持嵌套自身小程序的页面

**双向通信**：

```html
<!-- H5 端（引入官方 JSSDK） -->
<script src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js"></script>
<script>
  wx.miniProgram.postMessage({ data: { action: 'buy', id: 123 } });
  wx.miniProgram.navigateTo({ url: '/pages/pay/pay?id=123' });
</script>
```

```js
// 小程序端
onH5Msg(e) {
  // 注意：bindmessage 只在后退、组件销毁、分享时才触发（不是实时流）
  console.log(e.detail.data);
}
```

---

## 注意事项（通用）

1. **原生组件层级**：`video` / `map` / `canvas` / `camera` / `live-player` / `live-pusher` 层级高于普通组件。要覆盖它们请用 `cover-view` / `cover-image`，或开启同层渲染（2.4.0+，多数场景已默认开启）。
2. **事件语法**：`bind:tap`（冒泡） / `catch:tap`（阻止冒泡） / `mut-bind:tap`（互斥，2.8.2+） / `capture-bind:tap`（捕获阶段）。
3. **WXML 类型陷阱**：所有属性值都是字符串。要传布尔 `false` 必须写 `"{{false}}"`；写裸 `false` 会被当成字符串 `"false"`（真值）。
4. **列表渲染**：`wx:for` 必须配 `wx:key`。值是 item 里的字段名（**不是 `item.xx`**），基础类型可写 `*this`。
5. **尺寸单位**：`rpx` 为响应式像素，`750rpx = 屏幕宽度`；组件属性里的 `px` 通常是逻辑像素。
6. **性能**：避免 `setData` 一次性塞大数据进视图层；超长列表优先 `scroll-view type="list"` 或社区 `recycle-view`。
7. **授权**：相机、定位、录音等需 `scope.*` 授权；首次拒绝后需引导用户进入 `openSetting` 重新开启。

## 组合提示

- 表单三件套：`form` + 各表单组件（设 `name`） + `button form-type="submit"` + `bindsubmit`
- 用户信息三件套：`button open-type="chooseAvatar"`（头像）+ `input type="nickname"`（昵称）+ `button open-type="getPhoneNumber"`（手机号）
- 下拉刷新 / 上拉加载：页面级（`onPullDownRefresh` + `onReachBottom`）或组件级（`scroll-view` 的 `refresher-enabled` + `bindscrolltolower`）
- 富媒体叠加：`video` / `map` / `canvas` + `cover-view` 实现自定义 UI
- 配合 `wechat-mp-api` 了解对应 JS API（`wx.createVideoContext`、`wx.createMapContext`、`wx.createCameraContext` 等）
- 配合 `wechat-mp-core` 了解 Page/Component 生命周期与数据绑定机制
