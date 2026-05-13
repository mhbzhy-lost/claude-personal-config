import { Badge, Button, Drawer, Empty, Spin } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useCallback, useMemo, useState } from 'react';
import { NotificationItemView } from './NotificationItemView';
import type { NotificationCenterProps, NotificationItem } from '../types';

/**
 * Bell + badge button → Drawer with grouped unread / read list +
 * per-item mark-read / remove + "mark all" + load-more.
 *
 * Zero data ownership: host supplies items + action callbacks.
 */
export function NotificationCenter({
  items,
  loading,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onRemove,
  onLoadMore,
  hasMore,
  open: openProp,
  onOpenChange,
  placement = 'right',
  width = 380,
  emptyState,
  drawerTitle = '通知',
  trigger,
  ariaLabel = '打开通知中心',
  className,
}: NotificationCenterProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = useCallback(
    (v: boolean) => {
      if (openProp === undefined) setOpenInternal(v);
      onOpenChange?.(v);
    },
    [openProp, onOpenChange],
  );

  const computedUnread = useMemo(
    () => (unreadCount !== undefined ? unreadCount : items.filter((it) => !it.read).length),
    [items, unreadCount],
  );

  const { unread, read } = useMemo(() => {
    const u: NotificationItem[] = [];
    const r: NotificationItem[] = [];
    for (const it of items) (it.read ? r : u).push(it);
    return { unread: u, read: r };
  }, [items]);

  const triggerNode = trigger ?? (
    <Badge count={computedUnread} overflowCount={99} size="small">
      <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label={ariaLabel} />
    </Badge>
  );

  return (
    <>
      <span className="nc-trigger" onClick={() => setOpen(true)} role="presentation">
        {triggerNode}
      </span>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        placement={placement}
        width={width}
        title={drawerTitle}
        rootClassName={['nc-drawer', className].filter(Boolean).join(' ')}
        styles={{ body: { padding: 0 } }}
        extra={
          onMarkAllRead && computedUnread > 0 ? (
            <Button type="link" size="small" onClick={onMarkAllRead}>
              全部已读
            </Button>
          ) : null
        }
      >
        <div className="nc-list" role="region" aria-label="通知列表">
          {loading && items.length === 0 ? (
            <div className="nc-empty">
              <Spin />
            </div>
          ) : items.length === 0 ? (
            <div className="nc-empty">{emptyState ?? <Empty description="暂无通知" />}</div>
          ) : (
            <>
              {unread.length > 0 && (
                <div className="nc-group">
                  <div className="nc-group__title">未读 · {unread.length}</div>
                  {unread.map((it) => (
                    <NotificationItemView
                      key={it.id}
                      item={it}
                      onMarkRead={() => onMarkRead(it.id)}
                      onRemove={onRemove ? () => onRemove(it.id) : undefined}
                    />
                  ))}
                </div>
              )}
              {read.length > 0 && (
                <div className="nc-group">
                  <div className="nc-group__title">已读 · {read.length}</div>
                  {read.map((it) => (
                    <NotificationItemView
                      key={it.id}
                      item={it}
                      onMarkRead={() => onMarkRead(it.id)}
                      onRemove={onRemove ? () => onRemove(it.id) : undefined}
                    />
                  ))}
                </div>
              )}
              {hasMore && onLoadMore && (
                <div className="nc-loadmore">
                  <Button type="link" loading={loading} onClick={onLoadMore}>
                    加载更多
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}
