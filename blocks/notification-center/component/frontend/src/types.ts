import type { ReactNode } from 'react';

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'system';

export interface NotificationActor {
  name: string;
  avatar?: string;
}

export interface NotificationItem {
  /** Stable id. */
  id: string;
  /** Type drives the icon + accent color. */
  type: NotificationType;
  /** Headline. */
  title: ReactNode;
  /** Optional secondary body. */
  body?: ReactNode;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Whether this notification has been seen. */
  read: boolean;
  /** Who triggered the notification (optional avatar shown next to icon). */
  actor?: NotificationActor;
  /**
   * Optional primary action shown on the right (e.g. "Open", "View").
   * `onClick` is fired directly (host decides if it also marks as read).
   */
  action?: { label: ReactNode; onClick: () => void };
}

export interface NotificationCenterProps {
  // -------- Data (host-managed) --------

  items: NotificationItem[];
  loading?: boolean;

  /**
   * Optional unread count override. If undefined, the badge counts
   * items where `read === false`.
   */
  unreadCount?: number;

  // -------- Actions --------

  /** Called when the user marks a single item as read. */
  onMarkRead: (id: string) => void;

  /** "Mark all as read" button — when omitted, button is hidden. */
  onMarkAllRead?: () => void;

  /** Per-item delete — when omitted, delete button is hidden. */
  onRemove?: (id: string) => void;

  /** Load-more button at the bottom — when omitted, button is hidden. */
  onLoadMore?: () => void;
  hasMore?: boolean;

  // -------- Drawer open state (optional override) --------

  open?: boolean;
  onOpenChange?: (open: boolean) => void;

  // -------- Customization --------

  /** Drawer placement. Default 'right'. */
  placement?: 'left' | 'right';

  /** Drawer width (px). Default 380. */
  width?: number;

  /** Shown when items is empty (no loading, no items). */
  emptyState?: ReactNode;

  /** Drawer title. Default '通知'. */
  drawerTitle?: ReactNode;

  /** Override the trigger (default: bell button with badge). */
  trigger?: ReactNode;

  /** Aria label for the bell button. Default '打开通知中心'. */
  ariaLabel?: string;

  /** Extra class on the drawer root. */
  className?: string;
}
