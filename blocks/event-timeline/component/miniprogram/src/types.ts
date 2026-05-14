import type { ReactNode } from 'react';

export type EventType = string;

export interface EventActor {
  name: string;
  avatar?: string;
}

export interface EventItem {
  id: string;
  type: EventType;
  timestamp: string;
  title: ReactNode;
  body?: ReactNode;
  actor?: EventActor;
  meta?: Record<string, unknown>;
}

export interface EventTypeMeta {
  icon?: ReactNode;
  color?: string;
  label?: ReactNode;
}

export interface EventTimelineProps {
  items: EventItem[];
  typeMeta: Record<EventType, EventTypeMeta>;
  defaultColor?: string;
  groupBy?: 'none' | 'day' | 'month';
  order?: 'asc' | 'desc';
  filterTypes?: EventType[];
  onFilterTypesChange?: (types: EventType[]) => void;
  showFilter?: boolean;
  onClickItem?: (item: EventItem) => void;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  emptyState?: ReactNode;
  ariaLabel?: string;
  className?: string;
  height?: string | number;
}
