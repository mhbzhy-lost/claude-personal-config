import { useCallback, useEffect, useState } from 'react';

/**
 * Manage expanded keys with optional localStorage persistence and a
 * controlled-override mode (same pattern as app-shell-nav's persisted
 * collapsed state).
 */
export function usePersistedExpansion(opts: {
  controlled: string[] | undefined;
  onChange?: (keys: string[]) => void;
  persistKey?: string;
  defaultKeys?: string[];
}): [string[], (next: string[]) => void] {
  const { controlled, onChange, persistKey, defaultKeys = [] } = opts;

  const readPersisted = useCallback((): string[] | null => {
    if (!persistKey || typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(persistKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
      return null;
    } catch {
      return null;
    }
  }, [persistKey]);

  const [internal, setInternal] = useState<string[]>(() => {
    if (controlled !== undefined) return controlled;
    return readPersisted() ?? defaultKeys;
  });

  useEffect(() => {
    if (controlled !== undefined) setInternal(controlled);
  }, [controlled]);

  const set = useCallback(
    (next: string[]) => {
      if (controlled !== undefined) {
        onChange?.(next);
        return;
      }
      setInternal(next);
      onChange?.(next);
      if (persistKey && typeof window !== 'undefined') {
        window.localStorage.setItem(persistKey, JSON.stringify(next));
      }
    },
    [controlled, onChange, persistKey],
  );

  return [internal, set];
}
