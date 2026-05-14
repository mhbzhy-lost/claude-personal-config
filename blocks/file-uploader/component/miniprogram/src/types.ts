import type { ReactNode } from 'react';

export type UploadStatus = 'queued' | 'uploading' | 'success' | 'failed' | 'cancelled';

export interface MiniprogramFile {
  path: string;
  name: string;
  size: number;
  type?: string;
}

export interface UploadItem {
  id: string;
  file: MiniprogramFile;
  status: UploadStatus;
  progress: number;
  error?: string;
  retries: number;
  url?: string;
  thumb?: string;
}

export type UploadFn = (
  file: MiniprogramFile,
  setProgress: (pct: number) => void,
  signal: AbortSignal,
) => Promise<{ url: string; thumb?: string }>;

export interface FileUploaderProps {
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  multiple?: boolean;
  upload: UploadFn;
  concurrent?: number;
  retryLimit?: number;
  onChange?: (items: UploadItem[]) => void;
  onSuccess?: (item: UploadItem) => void;
  onError?: (item: UploadItem, error: Error) => void;
  paste?: boolean;
  showProgress?: boolean;
  dropzoneText?: ReactNode;
  dropzoneHint?: ReactNode;
  ariaLabel?: string;
  className?: string;
  height?: string | number;
}
