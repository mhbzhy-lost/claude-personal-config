import { useCallback, useEffect, useRef, useState } from 'react';
import type { UploadFn, UploadItem } from '../types';
import { isImage, makeId, validateAccept } from '../utils/file';

interface Options {
  upload: UploadFn;
  concurrent: number;
  retryLimit: number;
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  onChange?: (items: UploadItem[]) => void;
  onSuccess?: (item: UploadItem) => void;
  onError?: (item: UploadItem, error: Error) => void;
}

/**
 * Owns the upload queue:
 * - items state machine (queued → uploading → success/failed/cancelled)
 * - concurrency cap
 * - auto-retry on transient failure
 * - per-item AbortController for cancel
 *
 * Pure host-driven side effects: `upload` is provided by the consumer.
 */
export function useUploadQueue(opts: Options): {
  items: UploadItem[];
  enqueue: (files: File[]) => string[];
  remove: (id: string) => void;
  retry: (id: string) => void;
  clear: () => void;
} {
  const [items, setItems] = useState<UploadItem[]>([]);
  const abortMap = useRef<Map<string, AbortController>>(new Map());

  // emit onChange on every items change
  useEffect(() => {
    opts.onChange?.(items);
  }, [items, opts]);

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
        const { url, thumb } = await opts.upload(
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
        if (final) opts.onSuccess?.(final);
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
            if (nextRetries <= opts.retryLimit) {
              return { ...it, status: 'queued', error: e.message, retries: nextRetries };
            }
            const failed = { ...it, status: 'failed' as const, error: e.message };
            opts.onError?.(failed, e);
            return failed;
          }),
        );
      } finally {
        abortMap.current.delete(id);
      }
    },
    [opts, updateItem],
  );

  // Pump: keep `concurrent` uploads in flight at all times.
  useEffect(() => {
    const inFlight = items.filter((it) => it.status === 'uploading').length;
    const slots = Math.max(0, opts.concurrent - inFlight);
    if (slots === 0) return;
    const next = items.filter((it) => it.status === 'queued').slice(0, slots);
    for (const it of next) void runOne(it.id);
  }, [items, opts.concurrent, runOne]);

  const enqueue = useCallback(
    (files: File[]): string[] => {
      const newItems: UploadItem[] = [];
      for (const f of files) {
        const acceptErr = validateAccept(f, opts.accept);
        const sizeErr =
          opts.maxSize !== undefined && f.size > opts.maxSize ? '文件超过大小上限' : null;
        const it: UploadItem = {
          id: makeId(),
          file: f,
          status: acceptErr || sizeErr ? 'failed' : 'queued',
          progress: 0,
          retries: 0,
          error: acceptErr ?? sizeErr ?? undefined,
          previewUrl: isImage(f) ? URL.createObjectURL(f) : undefined,
        };
        newItems.push(it);
      }
      setItems((prev) => {
        const merged = [...prev, ...newItems];
        if (opts.maxFiles !== undefined && merged.length > opts.maxFiles) {
          // Drop oldest non-active to stay under cap.
          const overflow = merged.length - opts.maxFiles;
          let dropped = 0;
          return merged.filter((it) => {
            if (dropped >= overflow) return true;
            const inactive = it.status === 'success' || it.status === 'failed' || it.status === 'cancelled';
            if (inactive) {
              dropped += 1;
              if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
              return false;
            }
            return true;
          });
        }
        return merged;
      });
      return newItems.map((it) => it.id);
    },
    [opts.accept, opts.maxSize, opts.maxFiles],
  );

  const remove = useCallback((id: string) => {
    abortMap.current.get(id)?.abort();
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  const retry = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, status: 'queued', error: undefined, retries: 0 } : it,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    for (const ctrl of abortMap.current.values()) ctrl.abort();
    abortMap.current.clear();
    setItems((prev) => {
      for (const it of prev) if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      return [];
    });
  }, []);

  // Cleanup object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const ctrl of abortMap.current.values()) ctrl.abort();
      abortMap.current.clear();
    };
  }, []);

  return { items, enqueue, remove, retry, clear };
}
