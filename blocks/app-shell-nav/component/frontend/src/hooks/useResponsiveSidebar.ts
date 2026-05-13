import { useEffect, useState } from 'react';

/**
 * Tracks whether viewport is below `breakpoint`.
 * Returns `true` when "mobile" (drawer mode), `false` when "desktop" (sidebar mode).
 */
export function useResponsiveSidebar(breakpoint: number): boolean {
  const initial = typeof window !== 'undefined' && window.innerWidth < breakpoint;
  const [isMobile, setIsMobile] = useState<boolean>(initial);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}
