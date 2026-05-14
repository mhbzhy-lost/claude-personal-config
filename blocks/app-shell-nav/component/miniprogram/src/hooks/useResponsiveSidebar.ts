import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';

export function useResponsiveSidebar(breakpoint: number): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const sys = Taro.getSystemInfoSync();
    const update = () => {
      const w = sys.windowWidth;
      setIsMobile(w < breakpoint);
    };
    update();
    // Note: Mini programs don't have resize listeners on main thread,
    // but getSystemInfoSync is fast. Consumer calls on each page show.
  }, [breakpoint]);

  return isMobile;
}
