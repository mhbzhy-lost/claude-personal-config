import { useEffect, useState } from 'react';
import type { ResponsiveColumns } from '../types';

const DEFAULT_COLUMNS: Required<ResponsiveColumns> = {
  xs: 2,
  sm: 3,
  md: 4,
  lg: 4,
  xl: 6,
};

const BREAKPOINTS = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

function pickBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

/**
 * Resolves the effective column count.
 *
 * - number `columns` → returned as-is (no listener)
 * - `ResponsiveColumns` (or undefined → DEFAULT_COLUMNS) → tracks viewport
 *   width and resolves to the largest defined value at or below current
 *   breakpoint. Falls back to the nearest lower defined breakpoint, then
 *   to default if all empty.
 */
export function useResponsiveColumns(columns: number | ResponsiveColumns | undefined): number {
  const config: ResponsiveColumns =
    typeof columns === 'number'
      ? { xs: columns, sm: columns, md: columns, lg: columns, xl: columns }
      : (columns ?? DEFAULT_COLUMNS);

  const initial =
    typeof window === 'undefined'
      ? (config.lg ?? config.md ?? config.sm ?? config.xs ?? DEFAULT_COLUMNS.lg)
      : resolve(config, window.innerWidth);

  const [count, setCount] = useState<number>(initial);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setCount(resolve(config, window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [JSON.stringify(config)]);

  return Math.max(1, count);
}

function resolve(config: ResponsiveColumns, width: number): number {
  const bp = pickBreakpoint(width);
  const order: Breakpoint[] = ['xl', 'lg', 'md', 'sm', 'xs'];
  // Walk downward from current bp until we find a defined value.
  const cur = order.indexOf(bp);
  for (let i = cur; i < order.length; i++) {
    const v = config[order[i]];
    if (v !== undefined) return v;
  }
  // None defined at or below current — try going upward
  for (let i = cur - 1; i >= 0; i--) {
    const v = config[order[i]];
    if (v !== undefined) return v;
  }
  return DEFAULT_COLUMNS[bp];
}
