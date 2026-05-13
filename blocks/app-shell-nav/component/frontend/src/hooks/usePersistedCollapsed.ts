import { useCallback, useEffect, useState } from 'react';

/**
 * Internal collapsed state with optional localStorage persistence.
 *
 * Precedence:
 * - If `controlled` is provided (not undefined), the hook is a passthrough:
 *   it returns the controlled value and a setter that just calls `onChange`.
 * - Otherwise: initial value = persisted value (if persistKey + has entry)
 *   ← defaultCollapsed. On every setCollapsed, writes back to localStorage
 *   (when persistKey set).
 */
export function usePersistedCollapsed(opts: {
  controlled: boolean | undefined;
  onChange?: (c: boolean) => void;
  persistKey?: string;
  defaultCollapsed: boolean;
}): [boolean, (c: boolean) => void] {
  const { controlled, onChange, persistKey, defaultCollapsed } = opts;

  const readPersisted = useCallback((): boolean | null => {
    if (!persistKey || typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(persistKey);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return null;
  }, [persistKey]);

  const [internal, setInternal] = useState<boolean>(() => {
    if (controlled !== undefined) return controlled;
    const persisted = readPersisted();
    return persisted !== null ? persisted : defaultCollapsed;
  });

  // If becoming controlled, mirror; if becoming uncontrolled, keep current.
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
      if (persistKey && typeof window !== 'undefined') {
        window.localStorage.setItem(persistKey, c ? '1' : '0');
      }
    },
    [controlled, onChange, persistKey],
  );

  return [internal, set];
}
