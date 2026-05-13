# media-gallery SDK

媒体画廊 UI chrome:**缩略图网格(消费 card-flow)+ 全屏 viewer +
视频混排 + 元信息侧栏**。

```
component/
└── frontend/    MediaGallery + MediaThumbnail + Viewer + SKILL.md
```

## 整体复制

```bash
cp -r blocks/media-gallery/component your-project/sdk/ui-chrome/media-gallery
cp -r blocks/card-flow/component your-project/sdk/ui-chrome/card-flow   # 必需 peer
```

## 最小用法

```tsx
import { MediaGallery } from '@mg/media-gallery';
import type { MediaItem } from '@mg/media-gallery';
import '@mg/media-gallery/styles.css';
import '@cf/card-flow/styles.css';

const items: MediaItem[] = [
  {
    id: '1', kind: 'image', url: '/photos/sunset.jpg',
    alt: '海边日落', description: '2026 夏摄于三亚',
    meta: { '相机': 'Sony A7M4', 'ISO': 100, '快门': '1/250s' },
  },
  {
    id: '2', kind: 'video', url: '/videos/timelapse.mp4',
    alt: '城市延时', duration: 38, meta: { '时长': '38s', '分辨率': '4K' },
  },
];

<MediaGallery
  items={items}
  layout="grid"           // 或 'waterfall'
  columns={{ xs: 2, sm: 3, md: 4 }}
  onDownload={(it) => fetch(it.url).then(/* ... */)}
/>
```

## 关键设计

- **缩略图层走 card-flow**:可切 grid / waterfall;`columns` / `gap` 透传
- **图片 + 视频混排**:`kind: 'image' | 'video'`,视频缩略图有 ▶ 角标 + 时长
- **viewer**:antd Modal 内 image / `<video controls>` + 左右切换按钮 + 键盘 ←/→ 翻页 + 计数器
- **元信息侧栏**:`description` + `meta` key/value 表自动渲染;`renderSidebar` 可自定义
- **选中受控**:`selectedIndex + onSelectChange`,适配 URL 深链(`?photo=12`)
- **a11y**:缩略图 `role="button" + alt + 键盘`;viewer 内 nav buttons aria-label;视频禁用 `media-has-caption` 例外(host 内容决定字幕)

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@mg/media-gallery` |
| 必需 peer | `@cf/card-flow` |
| 后端 | (无,host 自管 url) |

## 何时**不**用

- 单图预览(不需要 grid) → antd `Image` / `Image.PreviewGroup`
- 纯视频列表(无图,需要播放队列)→ 视频专门组件
- 复杂照片编辑(裁剪/滤镜)→ 找专门方案
- 需要 EXIF 自动解析显示 → host 在 `meta` 自己传(本块不解析)

## 完整 Props 见 SKILL.md
