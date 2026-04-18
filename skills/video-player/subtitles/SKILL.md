---
name: video-player-subtitles
description: 使用 WebVTT 格式与 HTML track 元素 / WebVTT API 为 HTML5 视频添加字幕、闭路字幕、章节与时间对齐元数据，并通过 ::cue 伪元素进行样式定制
tech_stack: [web, html5-video, webvtt]
language: [javascript, html, css]
capability: [media-processing]
version: "WebVTT W3C Candidate Recommendation 2019-04-04"
collected_at: 2026-04-18
---

# Web 视频字幕（WebVTT + track）

> 来源：https://www.w3.org/TR/webvtt1/、https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API、https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/track

## 用途

WebVTT 是 `<video>` / `<audio>` 的时间对齐文本轨道格式（`.vtt`，MIME `text/vtt`，UTF-8），配合 HTML `<track>` 元素或 JavaScript WebVTT API（`TextTrack` / `VTTCue`），提供字幕、闭路字幕、视频描述、章节导航、时间对齐元数据等能力。

## 何时使用

- 给 `<video>` 挂字幕 / 闭路字幕（多语言、可切换）
- 提供章节跳转（`kind="chapters"`）
- 时间对齐的元数据广播（`kind="metadata"`，不可见）
- 通过 JS 动态注入 cue（如 AI 实时转写、直播补字幕）
- 需要卡拉 OK 式逐字高亮（timestamp tag + `::cue(:past)`）

## 基础用法

### 声明式：`<track>` 挂 .vtt

```html
<video controls src="video.mp4">
  <track default kind="captions" src="captions.vtt" srclang="en" label="English" />
  <track kind="subtitles" src="subtitles_de.vtt" srclang="de" label="Deutsch" />
  <track kind="chapters" src="chapters.vtt" srclang="en" />
  <track kind="descriptions" src="descriptions.vtt" srclang="en" />
</video>
```

### 编程式：addTextTrack + VTTCue

```javascript
const video = document.querySelector('video');
const track = video.addTextTrack('captions', 'Captions', 'en');
track.mode = 'showing';  // 'disabled' | 'hidden' | 'showing'
track.addCue(new VTTCue(0, 0.9, 'Hildy!'));
track.addCue(new VTTCue(1, 1.4, 'How are you?'));
track.addCue(new VTTCue(1.5, 2.9, 'Tell me, is the <u>lord</u> in?'));
```

### 最小 .vtt 文件

```
WEBVTT

1
00:00:22.230 --> 00:00:24.606
This is the first subtitle.

2
00:00:30.739 --> 00:00:34.074 line:63% position:72% align:start
This is the second.
```

## 关键 API

### WebVTT 文件结构

1. 头部：可选 BOM → `WEBVTT`（必需）→ 可选描述文本（不得含 `-->` 或换行）
2. 一个或多个空行
3. 零个或多个 `STYLE` / `REGION` / `NOTE` 块（必须在 cue 之前，`STYLE` 用于 `::cue` CSS）
4. 零个或多个 cue 块

### Cue 语法

```
[identifier]
HH:MM:SS.mmm --> HH:MM:SS.mmm [settings]
payload text（可多行；空行结束）
```

- 时间戳格式：`mm:ss.ttt` 或 `hh:mm:ss.ttt`
- **结束时间必须 > 开始时间；开始时间必须 >= 所有先前开始时间**（单调递增）
- identifier 可重复，不能含 `-->` 或换行
- payload 禁止出现 `-->`、`&`、`<`，改用 `&amp;` / `&lt;` / `&gt;` / `&nbsp;` / `&lrm;` / `&rlm;`

### Cue Settings（同一行、空格分隔）

| setting | 取值 | 作用 |
|---------|------|------|
| `vertical` | `rl` / `lr` | 垂直文本方向 |
| `line` | 数字（正=自顶，负=自底）或 `N%` | 垂直（或水平）位置 |
| `position` | `0-100%` | 水平（或垂直）位置 |
| `size` | `0-100%` | 宽度（或高度） |
| `align` | `start` / `center` / `end` / `left` / `right` | 文本对齐 |
| `region` | region id | 关联到 REGION |

### Payload 内联标签

`<i>` `<b>` `<u>` `<c.classname>` `<ruby><rt></rt></ruby>` `<v Speaker>` `<lang en-GB>` `<HH:MM:SS.mmm>`（timestamp tag，用于卡拉 OK 逐字高亮）

### `<track>` 属性

- `kind`：`subtitles`（默认）/ `captions` / `descriptions` / `chapters` / `metadata`（非法值会回落到 `metadata`）
- `src`：`.vtt` URL，**必须同源**，跨源需父 `<video>` 加 `crossorigin`
- `srclang`：BCP 47 语言标签；`kind="subtitles"` 时**必填**
- `label`：UI 下拉显示名
- `default`：一个 media 元素**最多一个** `default` track

### WebVTT API 接口

- `VTTCue`（start, end, text）：单条 cue
- `VTTRegion`：渲染区域
- `TextTrack`：单个轨道（有 `mode`、`cues`、`activeCues`、`addCue()`、`removeCue()`）
- `TextTrackList`：`video.textTracks`，附带 `addtrack` / `removetrack` 事件
- `HTMLTrackElement.track`：从 `<track>` DOM 取到对应 `TextTrack`
- `DataCue`：非文本的时间对齐数据（如 in-band 事件）

### 事件

```javascript
trackElem.addEventListener('cuechange', (e) => {
  const active = e.target.track.activeCues;  // 当前生效 cue 列表
});
```

`cuechange` 也会派发到 `TextTrack` 自身（即使未关联 media element）。

### 样式：`::cue` 伪元素

```css
video::cue            { color: red; font-size: 1.5rem; }
video::cue(b)         { color: purple; }          /* 标签 */
video::cue(.myclass)  { color: yellow; }          /* class */
video::cue(#cue1)     { color: green; }           /* id */
video::cue([lang="en-GB"]) { color: cyan; }       /* 属性 */
video::cue(:lang(en)) { color: yellow; }          /* 伪类 */
video::cue(:past)     { color: yellow; }          /* 卡拉 OK 已过去部分 */
video::cue(:future)   { color: cyan; }
```

`.vtt` 内嵌样式：

```
WEBVTT

STYLE
::cue { background: linear-gradient(to bottom, dimgray, lightgray); }

STYLE
::cue(b) { color: peachpuff; }

00:00:00.000 --> 00:00:10.000
Hello <b>world</b>.
```

### 预定义颜色 class

前景：`white lime cyan red yellow magenta blue black`；背景：`bg_white` … `bg_black`。

## 注意事项

- **MIME 必须是 `text/vtt`**，文件 UTF-8 编码，否则部分浏览器静默丢弃
- **同源策略**：`track.src` 默认需同源，跨 CDN 时 `<video crossorigin="anonymous">` + 服务器返回 `Access-Control-Allow-Origin`
- **STYLE / REGION 块必须出现在任何 cue 之前**
- **NOTE 与 STYLE 都不能含连续空行**（空行即块结束）
- **`::cue-region` 在所有浏览器都不支持**
- **`:past` / `:future` 是 at-risk 特性**，兼容性参差
- 同一 media 元素中，`kind + srclang + label` 组合必须唯一
- `kind="subtitles"` 必须有 `srclang`
- `default` 只能标在一个 track 上
- 编程式添加的 cue 不会自动显示，必须设 `track.mode = 'showing'`（或 `'hidden'` 仅触发 cuechange 不渲染）
- `hh` 允许两位以上；`mm`、`ss` 必须两位（00-59）
- cue 开始时间**单调递增**是强约束，乱序会被解析器拒绝

## 组合提示

- 与 `video-player-hls-dash` 搭配：HLS 的 WebVTT 字幕通过 m3u8 `#EXT-X-MEDIA:TYPE=SUBTITLES` 声明；hls.js 可设 `renderTextTracksNatively:false` 走 `CUES_PARSED` 事件自渲染
- 与 CEA-608/708 字幕搭配：HLS 流内嵌字幕由 hls.js 解出后注入 TextTrack，浏览器用同一套 `<track>` / `::cue` 体系展示
- IMSC1 / TTML：hls.js 可通过 `enableIMSC1` 支持，但样式渲染由库内部完成，`::cue` 仅对 WebVTT 生效
