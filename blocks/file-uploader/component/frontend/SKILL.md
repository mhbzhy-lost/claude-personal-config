---
name: file-uploader-frontend
description: 文件 / 图片上传(拖拽 + 点击 + 粘贴)必须用 `FileUploader`,禁止自行 Dropzone + useState + concurrent + retry 状态机拼。
---

# `@fu/file-uploader`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `FileUploader`:

- 需要拖拽上传 + 多文件队列 + 进度
- 需要 Cmd/Ctrl+V 粘贴图片(截图等)
- 需要并发控制 + 失败自动重试
- 需要文件类型 / 大小校验
- 需要单文件取消而不影响整批

## 何时**不**使用

- 仅需要 `<input type=file>` 单选 → 原生
- 图片裁剪 / 编辑 → 找专门方案
- 分块 / 断点续传(大文件 GB 级) → 本块未实现 chunk/resumable 协议
- OSS / S3 STS 直传流程 → 在 `upload` 函数内自行处理(本块只关心 Promise 结果)

## 安装

```bash
pnpm add file:./sdk/ui-chrome/file-uploader/frontend
```

## 最小用法

```tsx
import { FileUploader } from '@fu/file-uploader';
import '@fu/file-uploader/styles.css';

<FileUploader
  accept="image/*"
  maxSize={10 * 1024 * 1024}
  upload={async (file, setProgress, signal) => {
    // host implements (XHR / fetch / OSS direct)
    return { url: '...' };
  }}
  paste
  onSuccess={(it) => /* save it.url */}
/>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `accept` | `string` | — | 同 `<input accept>`(MIME / 扩展名) |
| `maxSize` | `number` | — | 单文件字节上限 |
| `maxFiles` | `number` | — | 队列上限(超时丢弃最早 inactive 项) |
| `multiple` | `boolean` | `true` | 多文件 |
| `upload` | `UploadFn` | — | **必填**,host 实现 |
| `concurrent` | `number` | `3` | 并发数 |
| `retryLimit` | `number` | `2` | 自动重试次数 |
| `onChange` | `(items) => void` | — | items 变化时触发(可持久化) |
| `onSuccess` | `(item) => void` | — | 单条成功 |
| `onError` | `(item, error) => void` | — | 单条最终失败 |
| `paste` | `boolean` | `false` | 启用 Cmd/Ctrl+V 粘贴 |
| `showProgress` | `boolean` | `true` | 进度条 |
| `dropzoneText` | `ReactNode` | `'点击或拖拽…'` | 主文案 |
| `dropzoneHint` | `ReactNode` | — | 副文案(常用列约束) |
| `ariaLabel` | `string` | `'文件上传区域'` | dropzone aria |
| `className` | `string` | — | 根类 |
| `height` | `string \| number` | `'auto'` | |

`UploadFn`:`(file, setProgress, signal) => Promise<{url, thumb?}>`

`UploadItem`:`{ id, file, status, progress, error?, retries, url?, thumb?, previewUrl? }`

## 内部已经处理好的事项

- ✅ 三入口:拖拽 / 点击文件选择器 / Cmd-V 粘贴(剪贴板带 files 时)
- ✅ 拖拽视觉反馈(`dragover` → 高亮 border + 底色)
- ✅ a11y:dropzone `role="button"` + tabIndex + Enter/Space 触发选择器
- ✅ 队列状态机:queued → uploading → success / failed / cancelled
- ✅ 并发控制:N slot,uploading 数维持上限
- ✅ 自动重试:transient 失败 retries++ 重排队;到 limit 才 failed
- ✅ AbortController:remove / 卸载时主动 abort,host 应 honor signal
- ✅ image 缩略图自动 ObjectURL + 卸载时 revokeObjectURL(防内存泄漏)
- ✅ accept / maxSize 在 enqueue 时同步校验,失败直接进 failed 不占 slot
- ✅ maxFiles 满时丢弃最早 inactive 项(不影响在飞)

## 严格禁止的反模式

❌ **自己拼 Dropzone + useState + xhr + retry**:本块就是为了消灭这种重复;每次手写都漏 abort / 内存释放 / 状态机

❌ **`upload` 内部不 honor signal**:取消按钮按下后 host 没收到 abort 就继续传,浪费带宽;正确写法见 README 示例(`signal.addEventListener('abort', ...)`)

❌ **`upload` 不调 `setProgress`**:进度条永远在 0;至少在开始/中段/结束各调一次

❌ **依赖 `onChange` 来触发持久化但忘了 unmount cleanup**:本块的 ObjectURL 会被卸载时 revoke,但 host 如果把 items 存到 localStorage 反序列化后,File 对象已失效,只能保 url(成功后的 url 字段)

❌ **paste 开启但只挂局部容器期望粘贴**:本块的 paste 监听是 `window` 级(全局),只要本组件挂载就生效。host 别同时再挂自己的 paste listener

❌ **改 sdk 内的 useUploadQueue.ts**:并发 / 重试策略想换 → 包 Adapter 控制 props;真要自定义状态机请考虑是不是该建新 block

## 状态

- v0.1 — 首版;后续可考虑:断点续传 / chunk 上传、拖拽排序、整体进度汇总条、图片自动旋转 EXIF
