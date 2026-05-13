import type { ReactNode } from 'react';

/**
 * Layout mode.
 * - 'split': always show list + detail side-by-side
 * - 'stack': always show one pane at a time (list when nothing selected, detail otherwise)
 * - 'auto' (default): split on wide screens, stack on narrow
 */
export type MasterDetailLayout = 'auto' | 'split' | 'stack';

export interface MasterDetailProps<T = unknown> {
  // -------- Data (host-managed) --------

  /** All list items. Host owns the fetch / state. */
  items: T[];

  /** Extract a stable id from an item. */
  getItemId: (item: T) => string;

  // -------- Controlled selection --------

  /** Currently selected id, or null when nothing selected. */
  selectedId: string | null;

  /** Called when the user picks a row, or when stack-mode back is pressed (null). */
  onSelect: (id: string | null) => void;

  // -------- Render slots --------

  /** Render one list row. `selected` lets you style the active row. */
  renderItem: (item: T, selected: boolean) => ReactNode;

  /** Render the detail pane for a given id. */
  renderDetail: (id: string) => ReactNode;

  /** Shown in the detail pane when no row is selected (split mode only). */
  placeholder?: ReactNode;

  /** Shown in the list pane when `items` is empty. */
  emptyList?: ReactNode;

  /**
   * In stack mode, rendered above the detail pane.
   * Host gets `onBack` to call (which fires `onSelect(null)`).
   * If omitted, no back affordance is rendered — host is expected to
   * provide its own (e.g. via an external navbar block).
   */
  renderBackButton?: (onBack: () => void) => ReactNode;

  // -------- Layout --------

  /** Default 'auto'. */
  layout?: MasterDetailLayout;

  /** Width (px) at which 'auto' switches between stack ↔ split. Default 768. */
  splitBreakpoint?: number;

  /** Split ratio [list, detail] when in split mode. Default [1, 2]. */
  splitRatio?: [number, number];

  // -------- Status / a11y / styling --------

  /** Show a loading indicator over the list pane. */
  loading?: boolean;

  /** Aria label for the list region. Default '列表'. */
  ariaListLabel?: string;

  /** Aria label for the detail region. Default '详情'. */
  ariaDetailLabel?: string;

  /** Extra class on the root element. */
  className?: string;

  /** Height of the component. Default '100%'. */
  height?: string | number;
}
