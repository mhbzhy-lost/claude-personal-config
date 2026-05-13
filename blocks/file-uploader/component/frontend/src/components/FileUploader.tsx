import { Dropzone } from './Dropzone';
import { UploadItemView } from './UploadItemView';
import { useUploadQueue } from '../hooks/useUploadQueue';
import type { FileUploaderProps } from '../types';

/**
 * File uploader with internal queue state machine.
 * - Dropzone: drag/drop, click-pick, optional clipboard paste
 * - Queue: status (queued → uploading → success/failed/cancelled),
 *   concurrency cap, auto-retry on transient failure
 * - Per-item: progress bar, preview thumbnail, retry/remove buttons
 *
 * Host implements `upload(file, onProgress, signal)` only.
 */
export function FileUploader({
  accept,
  maxSize,
  maxFiles,
  multiple = true,
  upload,
  concurrent = 3,
  retryLimit = 2,
  onChange,
  onSuccess,
  onError,
  paste = false,
  showProgress = true,
  dropzoneText,
  dropzoneHint,
  ariaLabel,
  className,
  height,
}: FileUploaderProps) {
  const queue = useUploadQueue({
    upload,
    concurrent,
    retryLimit,
    accept,
    maxSize,
    maxFiles,
    onChange,
    onSuccess,
    onError,
  });

  return (
    <div
      className={['fu-shell', className].filter(Boolean).join(' ')}
      style={{ height, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <Dropzone
        accept={accept}
        multiple={multiple}
        paste={paste}
        text={dropzoneText}
        hint={dropzoneHint}
        ariaLabel={ariaLabel}
        onFiles={queue.enqueue}
      />
      {queue.items.length > 0 && (
        <div className="fu-list" role="list" aria-label="上传队列">
          {queue.items.map((it) => (
            <UploadItemView
              key={it.id}
              item={it}
              showProgress={showProgress}
              onRemove={() => queue.remove(it.id)}
              onRetry={() => queue.retry(it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
