import type { ReactNode } from 'react';

export type CardFlowMode = 'grid' | 'waterfall' | 'single';

export interface ResponsiveColumns {
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
}

export interface CardFlowProps<T = unknown> {
  // -------- Data (host-managed) --------
  items: T[];
  getItemId: (item: T) => string;
  renderItem: (item: T) => ReactNode;

  // -------- Layout --------
  mode?: CardFlowMode;
  /**
   * Column count. For mini programs, only number is supported (no responsive
   * breakpoints — the viewport is typically fixed). Pass ResponsiveColumns if
   * you reuse web config; it will be resolved at mount via system info.
   */
  columns?: number | ResponsiveColumns;
  gap?: number;

  // -------- Optional slots --------
  emptyState?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;

  // -------- Events --------
  /** Fired on ScrollView scroll. */
  onScroll?: (e: ScrollEvent) => void;

  // -------- a11y / styling --------
  ariaLabel?: string;
  className?: string;
  /** Height of the root. Default '100vh'. */
  height?: string | number;
}

/** Arguments emitted by Taro ScrollView onScroll. */
export interface ScrollEvent {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  deltaX: number;
  deltaY: number;
}
