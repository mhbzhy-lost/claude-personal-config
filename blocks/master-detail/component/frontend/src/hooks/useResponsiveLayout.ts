import { useEffect, useState } from 'react';
import type { MasterDetailLayout } from '../types';

/**
 * Resolves the effective layout mode.
 * - When `mode` is 'auto', watches viewport width and returns 'split' or 'stack'
 *   depending on `breakpoint`.
 * - When 'split' / 'stack' is set explicitly, that wins (no listener attached).
 */
export function useResponsiveLayout(
  mode: MasterDetailLayout,
  breakpoint: number,
): 'split' | 'stack' {
  const initial: 'split' | 'stack' =
    mode === 'split' || mode === 'stack'
      ? mode
      : typeof window !== 'undefined' && window.innerWidth >= breakpoint
        ? 'split'
        : 'stack';

  const [resolved, setResolved] = useState<'split' | 'stack'>(initial);

  useEffect(() => {
    if (mode !== 'auto') {
      setResolved(mode);
      return;
    }
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const update = () => setResolved(mq.matches ? 'split' : 'stack');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [mode, breakpoint]);

  return resolved;
}
