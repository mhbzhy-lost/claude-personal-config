import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SearchGroup, SearchItem } from '../types';

/**
 * Flattens groups → linear array of selectable items and tracks the active
 * index for keyboard navigation. Skips disabled items.
 *
 * Returns:
 * - `flat` — all (non-disabled) items in render order
 * - `activeKey` — currently highlighted item key
 * - `setActiveKey` — set the highlight (used on hover)
 * - `move(delta)` — move highlight up/down by delta (wraps at edges)
 * - `commit()` — trigger the active item's `onSelect`, returns true if hit
 */
export function useFlatIndex(groups: SearchGroup[]): {
  flat: SearchItem[];
  activeKey: string | null;
  setActiveKey: (k: string | null) => void;
  move: (delta: number) => void;
  commit: () => boolean;
} {
  const flat = useMemo(() => {
    const out: SearchItem[] = [];
    for (const g of groups) for (const it of g.items) if (!it.disabled) out.push(it);
    return out;
  }, [groups]);

  const [activeKey, setActiveKey] = useState<string | null>(flat[0]?.key ?? null);

  // Reset highlight when the list shape changes meaningfully.
  useEffect(() => {
    if (!flat.length) {
      setActiveKey(null);
      return;
    }
    if (!activeKey || !flat.some((it) => it.key === activeKey)) {
      setActiveKey(flat[0].key);
    }
  }, [flat, activeKey]);

  const move = useCallback(
    (delta: number) => {
      if (!flat.length) return;
      const idx = activeKey ? flat.findIndex((it) => it.key === activeKey) : -1;
      const n = flat.length;
      const next = ((idx + delta) % n + n) % n;
      setActiveKey(flat[next].key);
    },
    [flat, activeKey],
  );

  const commit = useCallback(() => {
    if (!activeKey) return false;
    const it = flat.find((x) => x.key === activeKey);
    if (!it) return false;
    it.onSelect();
    return true;
  }, [flat, activeKey]);

  return { flat, activeKey, setActiveKey, move, commit };
}
