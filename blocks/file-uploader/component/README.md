# file-uploader SDK

文件上传 UI chrome:**dropzone + 队列 + 进度 + 重试** 整套。host 只要
实现一个 `upload(file, onProgress, signal)` 函数,其它(拖拽、粘贴、
并发、自动重试、缩略图、状态机)全自管。

```
component/
└── frontend/    FileUploader + Dropzone + UploadItemView + useUploadQueue + SKILL.md
```

## 整体复制

```bash
cp -r blocks/file-uploader/component your-project/sdk/ui-chrome/file-uploader
```

## 最小用法

```tsx
import { FileUploader } from '@fu/file-uploader';
import '@fu/file-uploader/styles.css';

async function upload(file: File, setProgress, signal): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  const xhr = new XMLHttpRequest();
  return new Promise((resolve, reject) => {
    xhr.open('POST', '/api/upload');
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress((e.loaded / e.total) * 100);
    xhr.onload = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(xhr.statusText));
    xhr.onerror = () => reject(new Error('网络错误'));
    signal.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

<FileUploader
  accept="image/*"
  maxSize={10 * 1024 * 1024}        // 10 MB
  maxFiles={20}
  upload={upload}
  concurrent={3}
  retryLimit={2}
  paste                              // 启用 Cmd/Ctrl+V 粘贴
  dropzoneText="拖拽图片到此处或点击选择"
  dropzoneHint="PNG / JPG,单文件 ≤ 10MB"
  onSuccess={(it) => console.log('uploaded', it.url)}
  onError={(it, e) => console.error(it.file.name, e)}
/>
```

## 关键设计

- **零行为耦合**:host 实现 `upload` 一个函数;返回 `{url, thumb?}`,组件不知道 OSS / S3 / 服务端协议
- **队列状态机**:每个文件 `queued → uploading → success / failed / cancelled`,失败自动重试 N 次后才进 `failed`
- **并发控制**:同时只允许 N 个 in-flight;其余 `queued` 等待 slot
- **AbortSignal**:取消 / 移除按钮触发 `controller.abort()`,host 的 fetch/XHR 应当 honor `signal`
- **缩略图**:image 自动用 `URL.createObjectURL(file)` 客户端预览,组件卸载时自动 `revokeObjectURL`(防内存泄漏)
- **粘贴**:`paste` 打开 → 监听 `window.paste` 事件,从 `clipboardData.files` 拿文件(截图常用)
- **验证**:`accept`(MIME / 扩展名)+ `maxSize` 在 enqueue 时同步验证,失败直接进 `failed` 不消耗 slot
- **a11y**:dropzone `role="button" + tabIndex + onKeyDown(Enter/Space)`;队列 `role="list"`

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@fu/file-uploader` |
| 后端 | (无,host 自管) |
| 协议 | (无,host 自管 upload contract) |

## 何时**不**用

- 仅需 `<input type=file>` → 原生即可
- 图片裁剪 / 编辑 → 找专门方案
- 分块 / 断点续传(大文件 > 1 GB) → 本块未实现 chunk 协议
- OSS / S3 STS 直传带预签名 URL → 在 `upload` 函数内自行处理(本块只关心结果)

## 完整 Props 见 SKILL.md
