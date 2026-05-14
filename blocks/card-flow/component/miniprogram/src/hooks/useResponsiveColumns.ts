import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
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

export function useResponsiveColumns(columns: number | ResponsiveColumns | undefined): number {
  const config: ResponsiveColumns =
    typeof columns === 'number'
      ? { xs: columns, sm: columns, md: columns, lg: columns, xl: columns }
      : (columns ?? DEFAULT_COLUMNS);

  const initial = resolve(
    config,
    typeof Taro !== 'undefined' ? Taro.getSystemInfoSync().screenWidth : 375,
  );

  const [count, setCount] = useState<number>(initial);

  useEffect(() => {
    const update = () => {
      try {
        const { screenWidth } = Taro.getSystemInfoSync();
        setCount(resolve(config, screenWidth));
      } catch {
        // ignore
      }
    };
    update();
    Taro.onWindowResize?.(update);
    return () => {
      Taro.offWindowResize?.(update);
    };
  }, [JSON.stringify(config)]);

  return Math.max(1, count);
}

function resolve(config: ResponsiveColumns, width: number): number {
  const bp = pickBreakpoint(width);
  const order: Breakpoint[] = ['xl', 'lg', 'md', 'sm', 'xs'];
  const cur = order.indexOf(bp);
  for (let i = cur; i < order.length; i++) {
    const v = config[order[i]];
    if (v !== undefined) return v;
  }
  for (let i = cur - 1; i >= 0; i--) {
    const v = config[order[i]];
    if (v !== undefined) return v;
  }
  return DEFAULT_COLUMNS[bp];
}
