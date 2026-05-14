import type { ReactNode } from 'react';

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'system';

export interface NotificationActor {
  name: string;
  avatar?: string;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: ReactNode;
  body?: ReactNode;
  timestamp: string;
  read: boolean;
  actor?: NotificationActor;
  action?: { label: ReactNode; onClick: () => void };
}

export interface NotificationCenterProps {
  items: NotificationItem[];
  loading?: boolean;
  unreadCount?: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead?: () => void;
  onRemove?: (id: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  emptyState?: ReactNode;
  drawerTitle?: ReactNode;
  /** Override the default bell trigger. */
  trigger?: ReactNode;
  ariaLabel?: string;
  className?: string;
}
