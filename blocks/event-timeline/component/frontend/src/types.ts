import type { ReactNode } from 'react';

/** Free-form event type key chosen by host (e.g. 'order.created', 'shipment.delivered'). */
export type EventType = string;

export interface EventActor {
  name: string;
  avatar?: string;
}

export interface EventItem {
  /** Stable id. */
  id: string;
  /** Type key — looked up in `typeMeta`. */
  type: EventType;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Headline (one line). */
  title: ReactNode;
  /** Optional details body (rendered under title or in expanded section). */
  body?: ReactNode;
  /** Optional actor (left avatar). */
  actor?: EventActor;
  /** Arbitrary structured payload — host can read in onClickItem etc. */
  meta?: Record<string, unknown>;
}

export interface EventTypeMeta {
  /** Icon shown in the timeline dot (overrides default circle). */
  icon?: ReactNode;
  /** Color for dot + line accent. */
  color?: string;
  /** Human-readable type name (used in the filter UI). */
  label?: ReactNode;
}

export interface EventTimelineProps {
  // -------- Data --------

  /** Events (host-managed). */
  items: EventItem[];

  /**
   * Type → meta map. Unknown types fall back to defaultColor + bullet.
   * Including a label here makes the type appear in the filter pills.
   */
  typeMeta: Record<EventType, EventTypeMeta>;

  /** Fallback color when type is unknown. Default '#8c8c8c'. */
  defaultColor?: string;

  // -------- Grouping / ordering --------

  /** Group label strategy. Default 'day'. */
  groupBy?: 'none' | 'day' | 'month';

  /** Order by timestamp. Default 'desc' (newest first). */
  order?: 'asc' | 'desc';

  // -------- Filtering (controlled) --------

  /**
   * Type keys to show. Undefined = show all.
   * Pair with the built-in filter pills (set internally by ToggleTypes UI):
   *   controlled: pass `filterTypes` + `onFilterTypesChange`
   *   uncontrolled: omit both — all types shown
   */
  filterTypes?: EventType[];
  onFilterTypesChange?: (types: EventType[]) => void;

  /** Show inline filter pills (chooses subset of typeMeta keys). Default false. */
  showFilter?: boolean;

  // -------- Interaction --------

  onClickItem?: (item: EventItem) => void;

  // -------- Pagination --------

  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;

  // -------- Slots / a11y --------

  emptyState?: ReactNode;
  ariaLabel?: string;
  className?: string;
  height?: string | number;
}
