import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import type { MasterDetailLayout } from '../types';

export function useResponsiveLayout(
  mode: MasterDetailLayout,
  breakpoint: number,
): 'split' | 'stack' {
  const getInitial = (): 'split' | 'stack' => {
    if (mode === 'split' || mode === 'stack') return mode;
    try {
      const { screenWidth } = Taro.getSystemInfoSync();
      return screenWidth >= breakpoint ? 'split' : 'stack';
    } catch {
      return 'stack';
    }
  };

  const [resolved, setResolved] = useState<'split' | 'stack'>(getInitial);

  useEffect(() => {
    if (mode !== 'auto') {
      setResolved(mode);
      return;
    }
    const update = () => {
      try {
        const { screenWidth } = Taro.getSystemInfoSync();
        setResolved(screenWidth >= breakpoint ? 'split' : 'stack');
      } catch {
        setResolved('stack');
      }
    };
    Taro.onWindowResize?.(update);
    return () => {
      Taro.offWindowResize?.(update);
    };
  }, [mode, breakpoint]);

  return resolved;
}
