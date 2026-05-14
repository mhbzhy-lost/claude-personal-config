import { useCallback, useEffect, useState } from 'react';
import Taro from '@tarojs/taro';

export function usePersistedCollapsed(opts: {
  controlled: boolean | undefined;
  onChange?: (c: boolean) => void;
  persistKey?: string;
  defaultCollapsed: boolean;
}): [boolean, (c: boolean) => void] {
  const { controlled, onChange, persistKey, defaultCollapsed } = opts;

  const readPersisted = useCallback((): boolean | null => {
    if (!persistKey) return null;
    try {
      const raw = Taro.getStorageSync(persistKey);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch { /* ignore */ }
    return null;
  }, [persistKey]);

  const [internal, setInternal] = useState<boolean>(() => {
    if (controlled !== undefined) return controlled;
    const persisted = readPersisted();
    return persisted !== null ? persisted : defaultCollapsed;
  });

  useEffect(() => {
    if (controlled !== undefined) setInternal(controlled);
  }, [controlled]);

  const set = useCallback(
    (c: boolean) => {
      if (controlled !== undefined) {
        onChange?.(c);
        return;
      }
      setInternal(c);
      onChange?.(c);
      if (persistKey) {
        Taro.setStorageSync(persistKey, c ? '1' : '0');
      }
    },
    [controlled, onChange, persistKey],
  );

  return [internal, set];
}
