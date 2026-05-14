import { View, Text, ScrollView } from '@tarojs/components';
import { Badge, Loading } from '@antmjs/vantui';
import { useMemo, useState } from 'react';
import type { NotificationCenterProps, NotificationItem } from '../types';

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  info: { icon: 'ℹ', color: '#1677ff' },
  success: { icon: '✓', color: '#52c41a' },
  warning: { icon: '⚠', color: '#faad14' },
  error: { icon: '✕', color: '#ff4d4f' },
  system: { icon: '⚙', color: '#8c8c8c' },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function groupByRead(items: NotificationItem[]): { unread: NotificationItem[]; read: NotificationItem[] } {
  return {
    unread: items.filter((i) => !i.read),
    read: items.filter((i) => i.read),
  };
}

export function NotificationCenter({
  items,
  loading = false,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onRemove,
  onLoadMore,
  hasMore = false,
  open: openProp,
  onOpenChange,
  emptyState,
  drawerTitle = '通知',
  trigger,
  ariaLabel,
  className,
}: NotificationCenterProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = openProp ?? internalOpen;

  const actualUnread = unreadCount ?? items.filter((i) => !i.read).length;

  const grouped = useMemo(() => groupByRead(items), [items]);

  const toggleOpen = () => {
    const next = !isOpen;
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <View className={`nc-mp-notification ${className ?? ''}`}>
      {/* Trigger */}
      <View onClick={toggleOpen} aria-label={ariaLabel ?? '打开通知中心'}>
        {trigger ?? (
          <View style={{ position: 'relative', display: 'inline-flex', padding: '8px' }}>
            <Text style={{ fontSize: '24px' }}>🔔</Text>
            {actualUnread > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  minWidth: '16px',
                  height: '16px',
                  background: '#ff4d4f',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}
              >
                <Text>{actualUnread > 99 ? '99+' : String(actualUnread)}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Drawer / Popup */}
      {isOpen && (
        <View
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '320px',
            background: '#fff',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
          }}
        >
          {/* Header */}
          <View
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid #f0f0f0',
              flexShrink: 0,
            }}
          >
            <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 600 }}>{drawerTitle}</Text>
              {actualUnread > 0 && (
                <Badge content={actualUnread} />
              )}
            </View>
            <View style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
              {onMarkAllRead && (
                <Text
                  style={{ fontSize: '13px', color: '#1677ff' }}
                  onClick={() => { onMarkAllRead(); }}
                >
                  全部已读
                </Text>
              )}
              <Text
                style={{ fontSize: '18px', color: '#999', paddingLeft: '8px' }}
                onClick={toggleOpen}
              >
                ✕
              </Text>
            </View>
          </View>

          {/* Body */}
          <ScrollView style={{ flex: 1 }} scrollY>
            {items.length === 0 && !loading ? (
              <View style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                {emptyState ?? <Text>暂无通知</Text>}
              </View>
            ) : (
              <View>
                {grouped.unread.length > 0 && (
                  <View>
                    <View style={{ padding: '8px 16px', background: '#fafafa', fontSize: '12px', color: '#999' }}>
                      <Text>未读 ({grouped.unread.length})</Text>
                    </View>
                    {grouped.unread.map((item) => (
                      <NotificationRow
                        key={item.id}
                        item={item}
                        onMarkRead={onMarkRead}
                        onRemove={onRemove}
                      />
                    ))}
                  </View>
                )}
                {grouped.read.length > 0 && (
                  <View>
                    <View style={{ padding: '8px 16px', background: '#fafafa', fontSize: '12px', color: '#999' }}>
                      <Text>已读 ({grouped.read.length})</Text>
                    </View>
                    {grouped.read.map((item) => (
                      <NotificationRow
                        key={item.id}
                        item={item}
                        onMarkRead={onMarkRead}
                        onRemove={onRemove}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}

            {hasMore && (
              <View style={{ padding: '16px', textAlign: 'center' }}>
                <Text
                  style={{ fontSize: '13px', color: '#1677ff' }}
                  onClick={onLoadMore}
                >
                  加载更多
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* Backdrop */}
      {isOpen && (
        <View
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            right: '320px',
            zIndex: 1999,
            background: 'rgba(0,0,0,0.3)',
          }}
          onClick={toggleOpen}
        />
      )}
    </View>
  );
}

function NotificationRow({
  item,
  onMarkRead,
  onRemove,
}: {
  item: NotificationItem;
  onMarkRead: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.info;

  return (
    <View
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #f5f5f5',
        background: item.read ? '#fff' : '#fafcff',
        display: 'flex',
        flexDirection: 'row',
        gap: '10px',
        alignItems: 'flex-start',
      }}
      onClick={() => onMarkRead(item.id)}
    >
      {/* Icon */}
      <View
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: cfg.color,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          flexShrink: 0,
        }}
      >
        <Text>{cfg.icon}</Text>
      </View>

      {/* Content */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: '14px', fontWeight: item.read ? 400 : 500 }}>{item.title}</Text>
        {item.body && (
          <View style={{ marginTop: '4px' }}>
            <Text style={{ fontSize: '12px', color: '#666' }}>{item.body}</Text>
          </View>
        )}
        <Text style={{ fontSize: '11px', color: '#bbb', marginTop: '4px', display: 'block' }}>
          {formatTimestamp(item.timestamp)}
        </Text>
      </View>

      {/* Actions */}
      <View style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', flexShrink: 0 }}>
        {item.action && (
          <Text
            style={{ fontSize: '12px', color: '#1677ff' }}
            onClick={(e: any) => { e.stopPropagation?.(); item.action!.onClick(); }}
          >
            {item.action.label}
          </Text>
        )}
        {onRemove && (
          <Text
            style={{ fontSize: '12px', color: '#ff4d4f' }}
            onClick={(e: any) => { e.stopPropagation?.(); onRemove(item.id); }}
          >
            删除
          </Text>
        )}
      </View>
    </View>
  );
}
