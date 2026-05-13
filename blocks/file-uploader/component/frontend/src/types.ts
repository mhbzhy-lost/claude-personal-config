import type { ReactNode } from 'react';

export type UploadStatus = 'queued' | 'uploading' | 'success' | 'failed' | 'cancelled';

export interface UploadItem {
  /** Stable id assigned when the item enters the queue. */
  id: string;
  /** The original File object. */
  file: File;
  /** Current state. */
  status: UploadStatus;
  /** 0–100. Only meaningful while `status === 'uploading'`. */
  progress: number;
  /** Last error message (status === 'failed'). */
  error?: string;
  /** Number of retries already attempted. */
  retries: number;
  /** Result URL once successful (returned by the host's upload fn). */
  url?: string;
  /** Optional thumbnail URL (e.g. for image previews). */
  thumb?: string;
  /** Object URL produced by the component for client-side preview. */
  previewUrl?: string;
}

/**
 * Host-provided upload function. Receives:
 * - the File to upload
 * - a `setProgress(0..100)` callback the host should call as bytes go up
 * - an `AbortSignal` the host should honor (fetch's `signal`); when aborted,
 *   reject with `DOMException('AbortError')`.
 *
 * Resolve with `{ url, thumb? }`.
 */
export type UploadFn = (
  file: File,
  setProgress: (pct: number) => void,
  signal: AbortSignal,
) => Promise<{ url: string; thumb?: string }>;

export interface FileUploaderProps {
  // -------- Validation --------

  /** MIME / extension filter (same syntax as `<input accept>`). */
  accept?: string;
  /** Max bytes per file. Undefined = no limit. */
  maxSize?: number;
  /** Max queued + in-flight + done items. Undefined = unlimited. */
  maxFiles?: number;
  /** Allow selecting multiple files at once. Default true. */
  multiple?: boolean;

  // -------- Upload behaviour --------

  /** Host-implemented upload (required). */
  upload: UploadFn;

  /** Max concurrent uploads. Default 3. */
  concurrent?: number;

  /** Auto-retry count on failure (per file). Default 2. */
  retryLimit?: number;

  // -------- State --------

  /** Fired whenever the items array changes (host can persist / observe). */
  onChange?: (items: UploadItem[]) => void;

  /** Fired once per item when it transitions to 'success'. */
  onSuccess?: (item: UploadItem) => void;

  /** Fired when an item is permanently failed (retries exhausted). */
  onError?: (item: UploadItem, error: Error) => void;

  // -------- Optional features --------

  /** Enable Ctrl/Cmd+V paste-from-clipboard (images). Default false. */
  paste?: boolean;

  /** Show per-file progress bar. Default true. */
  showProgress?: boolean;

  // -------- UI / slots --------

  /** Dropzone text. */
  dropzoneText?: ReactNode;

  /** Dropzone hint (secondary, e.g. "PNG, JPG up to 10 MB"). */
  dropzoneHint?: ReactNode;

  /** ARIA label for the dropzone region. Default '文件上传区域'. */
  ariaLabel?: string;

  /** Extra class on the root element. */
  className?: string;

  /** Root height. Default 'auto'. */
  height?: string | number;
}
