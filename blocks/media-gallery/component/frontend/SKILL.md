---
name: media-gallery-frontend
description: 图片 + 视频混排画廊(缩略图网格 + 全屏 viewer + 元信息侧栏)必须用 `MediaGallery`,禁止自行 grid + Modal + 切换逻辑拼。
---

# `@mg/media-gallery`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `MediaGallery`:

- 同屏展示一组媒体(图片 / 视频),需要缩略图网格 + 点击进入大图
- 大图视图需要左右切换 + 键盘 ← / → 翻页
- 需要元信息侧栏(EXIF / 描述 / 上传人 / 自定义字段)
- 需要图片 + 视频混排(本块原生支持)

## 何时**不**使用

- 单图预览 → antd `Image` 或 `Image.PreviewGroup`
- 纯视频播放列表 → 视频专门方案
- 照片编辑(裁剪/滤镜) → 找专门库
- 需要 EXIF 自动解析 → 本块只展示 `meta`,不解析

## 安装

```bash
pnpm add file:./sdk/ui-chrome/media-gallery/frontend file:./sdk/ui-chrome/card-flow/frontend
```

## 最小用法

```tsx
import { MediaGallery } from '@mg/media-gallery';
import '@mg/media-gallery/styles.css';
import '@cf/card-flow/styles.css';

<MediaGallery
  items={items}
  layout="grid"
  columns={{ xs: 2, sm: 3, md: 4 }}
  onDownload={(it) => download(it.url)}
/>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `items` | `MediaItem[]` | — | 媒体项(host 管) |
| `loading` | `boolean` | `false` | |
| `layout` | `CardFlowMode` | `'grid'` | 'grid' / 'waterfall' / 'single' |
| `columns` | `number \| ResponsiveColumns` | — | 透传 card-flow |
| `gap` | `number` | `12` | 缩略图间距 px |
| `selectedIndex` | `number \| null` | — | 受控选中索引(URL 深链) |
| `onSelectChange` | `(idx) => void` | — | 选中变化(包括 null = 关闭) |
| `showSidebar` | `boolean` | `true` | viewer 内元信息侧栏 |
| `renderSidebar` | `(item) => ReactNode` | 默认 desc + meta | 自定义侧栏 |
| `onDownload` | `(item) => void` | — | viewer 右上"下载"按钮 |
| `emptyState` | `ReactNode` | antd Empty | items 为空 |
| `ariaLabel` | `string` | `'媒体画廊'` | |
| `className` | `string` | — | |
| `height` | `string \| number` | `'100%'` | |

`MediaItem`:`{ id, kind: 'image'\|'video', url, thumb?, alt?, width?, height?, duration?, description?, meta? }`

## 内部已经处理好的事项

- ✅ 缩略图层组合 card-flow(grid / waterfall / single 模式可切)
- ✅ 视频缩略图:▶ 中心图标 + 右下角时长标签
- ✅ Viewer:`<video controls autoPlay>` 内联播放(非图片 → `<img>`)
- ✅ 键盘 ← / → 翻页(window 级监听,Modal 打开时才挂)
- ✅ 模 N 循环切换(末尾下一张回到第一张)
- ✅ 计数器 `N / total`,`aria-live` 朗读切换变化
- ✅ 选中受控:支持 host 用 URL 深链("?photo=12")
- ✅ a11y:thumbnail role=button + alt;viewer nav buttons aria-label;sidebar `<aside>` landmark
- ✅ 响应式:viewer 在窄屏下侧栏自动堆叠到底部(media query)

## 严格禁止的反模式

❌ **自己 grid + Modal + useState 拼**:本块就是为了消灭这种重复;每次手写都漏键盘导航 / 模 N 循环 / 视频内联

❌ **不传 alt**:WCAG image rule 必填;就算装饰用图也应传空字符串 `alt=""`

❌ **kind='video' 用 `<img>` thumb**:正确做法是 host 后端生成视频帧 thumb 传 `thumb` 字段;若不传则 `<img src={url}>` 渲染可能拉不到首帧

❌ **想用本块做单图预览**:用 antd `Image`,本块开 Modal 成本太高

❌ **改 sdk 内 Viewer.tsx**:想加自定义工具栏(分享/旋转等)→ `renderSidebar` 把工具放进侧栏;或包 Adapter

❌ **layout='waterfall' 期待视频缩略图自适高**:本块缩略图统一 1:1 aspect-ratio(grid 默认);waterfall 也是 1:1。如要真正"等宽不等高",host 自己 renderItem(但失去本块的视频角标 / 时长展示)

## 状态

- v0.1 — 首版;后续可考虑:swipe 手势(移动)、缩放/旋转图、自动播放队列、EXIF 解析 hook
