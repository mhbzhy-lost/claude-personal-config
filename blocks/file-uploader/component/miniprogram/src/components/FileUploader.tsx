import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileUploaderProps, MiniprogramFile, UploadItem } from '../types';

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function FileUploader({
  accept,
  maxSize,
  maxFiles,
  multiple = true,
  upload: uploadFn,
  concurrent = 3,
  retryLimit = 2,
  onChange,
  onSuccess,
  onError,
  showProgress = true,
  dropzoneText,
  dropzoneHint,
  ariaLabel = '文件上传区域',
  className,
  height,
}: FileUploaderProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const abortMap = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    onChange?.(items);
  }, [items, onChange]);

  const updateItem = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    },
    [],
  );

  const runOne = useCallback(
    async (id: string) => {
      const ctrl = new AbortController();
      abortMap.current.set(id, ctrl);

      let current!: UploadItem;
      setItems((prev) => {
        current = prev.find((x) => x.id === id)!;
        return prev.map((it) =>
          it.id === id ? { ...it, status: 'uploading', progress: 0, error: undefined } : it,
        );
      });
      if (!current) return;

      try {
        const { url, thumb } = await uploadFn(
          current.file,
          (pct) => updateItem(id, { progress: Math.max(0, Math.min(100, pct)) }),
          ctrl.signal,
        );
        let final: UploadItem | null = null;
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== id) return it;
            final = { ...it, status: 'success' as const, progress: 100, url, thumb };
            return final;
          }),
        );
        if (final) onSuccess?.(final);
      } catch (err) {
        const isAbort = (err as { name?: string })?.name === 'AbortError';
        if (isAbort) {
          updateItem(id, { status: 'cancelled' });
          return;
        }
        const e = err as Error;
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== id) return it;
            const nextRetries = it.retries + 1;
            if (nextRetries <= retryLimit) {
              return { ...it, status: 'queued', error: e.message, retries: nextRetries };
            }
            const failed = { ...it, status: 'failed' as const, error: e.message };
            onError?.(failed, e);
            return failed;
          }),
        );
      } finally {
        abortMap.current.delete(id);
      }
    },
    [uploadFn, retryLimit, onSuccess, onError, updateItem],
  );

  useEffect(() => {
    const inFlight = items.filter((it) => it.status === 'uploading').length;
    const slots = Math.max(0, concurrent - inFlight);
    if (slots === 0) return;
    const next = items.filter((it) => it.status === 'queued').slice(0, slots);
    for (const it of next) void runOne(it.id);
  }, [items, concurrent, runOne]);

  const enqueue = useCallback(
    (files: MiniprogramFile[]) => {
      const newItems: UploadItem[] = [];
      for (const f of files) {
        const sizeErr = maxSize !== undefined && f.size > maxSize ? '文件超过大小上限' : null;
        const it: UploadItem = {
          id: makeId(),
          file: f,
          status: sizeErr ? 'failed' : 'queued',
          progress: 0,
          retries: 0,
          error: sizeErr ?? undefined,
        };
        newItems.push(it);
      }
      setItems((prev) => {
        const merged = [...prev, ...newItems];
        if (maxFiles !== undefined && merged.length > maxFiles) {
          const overflow = merged.length - maxFiles;
          let dropped = 0;
          return merged.filter((it) => {
            if (dropped >= overflow) return true;
            const inactive = it.status === 'success' || it.status === 'failed' || it.status === 'cancelled';
            if (inactive) {
              dropped += 1;
              return false;
            }
            return true;
          });
        }
        return merged;
      });
    },
    [maxSize, maxFiles],
  );

  const remove = useCallback((id: string) => {
    abortMap.current.get(id)?.abort();
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const retry = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, status: 'queued', error: undefined, retries: 0 } : it,
      ),
    );
  }, []);

  useEffect(() => {
    return () => {
      for (const ctrl of abortMap.current.values()) ctrl.abort();
      abortMap.current.clear();
    };
  }, []);

  const handlePick = () => {
    if (accept?.startsWith('image/')) {
      Taro.chooseImage({
        count: multiple ? (maxFiles ?? 9) : 1,
        sizeType: ['original', 'compressed'],
        success: (res: { tempFiles: { path: string; size: number }[] }) => {
          const files: MiniprogramFile[] = res.tempFiles.map((tf) => ({
            path: tf.path,
            name: `image_${Date.now()}.jpg`,
            size: tf.size,
            type: 'image/jpeg',
          }));
          enqueue(files);
        },
      });
    } else if (accept?.startsWith('video/')) {
      Taro.chooseVideo({
        sourceType: ['album', 'camera'],
        success: (res: { tempFilePath: string; size: number; duration: number }) => {
          enqueue([{
            path: res.tempFilePath,
            name: `video_${Date.now()}.mp4`,
            size: res.size,
            type: 'video/mp4',
          }]);
        },
      });
    } else {
      Taro.chooseMessageFile({
        count: multiple ? (maxFiles ?? 9) : 1,
        type: 'all',
        success: (res: { tempFiles: { path: string; name: string; size: number }[] }) => {
          const files: MiniprogramFile[] = res.tempFiles.map((tf) => ({
            path: tf.path,
            name: tf.name,
            size: tf.size,
            type: '',
          }));
          enqueue(files);
        },
      });
    }
  };

  return (
    <View
      className={`fu-mp-shell ${className ?? ''}`}
      style={{ height: typeof height === 'number' ? `${height * 2}rpx` : height, display: 'flex', flexDirection: 'column' }}
    >
      {/* Dropzone */}
      <View
        className='fu-mp-dropzone'
        onClick={handlePick}
        aria-label={ariaLabel}
        style={{
          border: '2rpx dashed #d9d9d9',
          borderRadius: '16rpx',
          padding: '40rpx 24rpx',
          textAlign: 'center',
          background: '#fafafa',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16rpx',
        }}
      >
        <Text style={{ fontSize: '48rpx' }}>📁</Text>
        <Text style={{ fontSize: '28rpx', color: '#666' }}>
          {dropzoneText ?? '点击选择文件'}
        </Text>
        {dropzoneHint && (
          <Text style={{ fontSize: '24rpx', color: '#999' }}>{dropzoneHint}</Text>
        )}
      </View>

      {/* Queue */}
      {items.length > 0 && (
        <View style={{ flex: 1, marginTop: '24rpx', overflow: 'auto' }}>
          {items.map((it) => (
            <View
              key={it.id}
              className='fu-mp-item'
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '20rpx',
                padding: '20rpx 16rpx',
                borderBottom: '1px solid #f5f5f5',
                background: it.status === 'failed' ? '#fff2f0' : '#fff',
              }}
            >
              {/* Thumb */}
              <View
                style={{
                  width: '80rpx',
                  height: '80rpx',
                  borderRadius: '8rpx',
                  background: '#f0f0f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
              >
                {it.thumb ? (
                  <Image src={it.thumb} mode='aspectFill' style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={{ fontSize: '36rpx' }}>📄</Text>
                )}
              </View>

              {/* Info */}
              <View style={{ flex: 1, minWidth: 0 }} aria-label={`${it.file.name}，${formatBytes(it.file.size)}`}>
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12rpx' }}>
                  <Text
                    style={{
                      fontSize: '26rpx',
                      color: '#333',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {it.file.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: '22rpx',
                      padding: '2rpx 12rpx',
                      borderRadius: '4rpx',
                      color: '#fff',
                      background:
                        it.status === 'queued' ? '#bfbfbf' :
                        it.status === 'uploading' ? '#1677ff' :
                        it.status === 'success' ? '#52c41a' :
                        it.status === 'failed' ? '#ff4d4f' : '#faad14',
                    }}
                  >
                    {
                      it.status === 'queued' ? '等待中' :
                      it.status === 'uploading' ? '上传中' :
                      it.status === 'success' ? '完成' :
                      it.status === 'failed' ? '失败' : '已取消'
                    }
                  </Text>
                </View>
                <Text style={{ fontSize: '22rpx', color: '#999' }}>{formatBytes(it.file.size)}</Text>
                {it.error && (
                  <Text style={{ fontSize: '22rpx', color: '#ff4d4f' }}>{it.error}</Text>
                )}
                {showProgress && it.status === 'uploading' && (
                  <View style={{ marginTop: '8rpx', height: '6rpx', background: '#f0f0f0', borderRadius: '3rpx', overflow: 'hidden' }}>
                    <View
                      style={{
                        width: `${Math.round(it.progress)}%`,
                        height: '100%',
                        background: '#1677ff',
                        transition: 'width 0.3s',
                      }}
                    />
                  </View>
                )}
              </View>

              {/* Actions */}
              <View style={{ display: 'flex', flexDirection: 'column', gap: '8rpx', flexShrink: 0 }}>
                {it.status === 'failed' && (
                  <Text
                    style={{ fontSize: '24rpx', color: '#1677ff' }}
                    onClick={(e: any) => { e.stopPropagation?.(); retry(it.id); }}
                    aria-label={`重试 ${it.file.name}`}
                  >
                    重试
                  </Text>
                )}
                <Text
                  style={{ fontSize: '24rpx', color: '#ff4d4f' }}
                  onClick={(e: any) => { e.stopPropagation?.(); remove(it.id); }}
                  aria-label={`移除 ${it.file.name}`}
                >
                  移除
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
