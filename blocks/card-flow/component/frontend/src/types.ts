import type { ReactNode } from 'react';

/**
 * Layout mode.
 * - 'grid': equal-height cells in a fixed-column CSS grid (default; what most
 *   shop / catalog UIs need)
 * - 'waterfall': masonry-style multi-column where cards keep their natural
 *   height; uses CSS `column-count` (fills column-by-column, not by shortest)
 * - 'single': one card per row, vertical stack (feed / timeline)
 */
export type CardFlowMode = 'grid' | 'waterfall' | 'single';

/**
 * Column counts by antd-style breakpoint. All optional;
 * fallback chain: xs ← sm ← md ← lg ← xl (use the largest
 * defined value at or below the current viewport).
 * Ignored when mode='single'.
 */
export interface ResponsiveColumns {
  /** < 576 px */
  xs?: number;
  /** ≥ 576 px */
  sm?: number;
  /** ≥ 768 px */
  md?: number;
  /** ≥ 992 px */
  lg?: number;
  /** ≥ 1200 px */
  xl?: number;
}

export interface CardFlowProps<T = unknown> {
  // -------- Data (host-managed) --------

  /** All items. Host owns fetch / pagination / search / cache. */
  items: T[];

  /** Stable id for each item — used as React key. */
  getItemId: (item: T) => string;

  /** Render one card. Wrap your own content; the shell adds no chrome. */
  renderItem: (item: T) => ReactNode;

  // -------- Layout --------

  /** Default 'grid'. */
  mode?: CardFlowMode;

  /**
   * Column count.
   * - number: same column count at every breakpoint
   * - ResponsiveColumns: per-breakpoint override
   * - undefined: defaults to {xs:2, sm:3, md:4, lg:4, xl:6}
   * Ignored when mode='single' (always 1 column).
   */
  columns?: number | ResponsiveColumns;

  /** Gap between cards (px). Default 16. */
  gap?: number;

  // -------- Optional slots --------

  /** Shown when items.length === 0 and !loading. */
  emptyState?: ReactNode;

  /** Visually shown above the cards (e.g. filter toolbar). Optional. */
  header?: ReactNode;

  /** Visually shown below the cards (e.g. load-more button, sentinel). */
  footer?: ReactNode;

  /** Loading indicator over the list area (does not unmount cards). */
  loading?: boolean;

  /**
   * Raw scroll event from the inner scroll container. Host decides what to
   * do with it (e.g. detect "near bottom" and trigger load-more). The
   * component itself never observes scroll position.
   */
  onScroll?: (e: import('react').UIEvent<HTMLDivElement>) => void;

  // -------- a11y / styling --------

  /** ARIA label for the list region. Default '卡片列表'. */
  ariaLabel?: string;

  /** Extra class on the root element. */
  className?: string;

  /** Height of the root. Default '100%'. */
  height?: string | number;
}
