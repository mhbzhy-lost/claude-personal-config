import { View, Text, ScrollView, Image } from '@tarojs/components';
import { Tag, Loading, Button } from '@antmjs/vantui';
import { useMemo } from 'react';
import type { EventTimelineProps, EventItem, EventType } from '../types';

const FALLBACK_COLOR = '#8c8c8c';

function formatTime(iso: string, mode: 'day' | 'month'): string {
  const d = new Date(iso);
  if (mode === 'month') return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Grouped {
  label: string;
  items: EventItem[];
}

function groupAndSort(
  items: EventItem[],
  key: 'none' | 'day' | 'month',
  order: 'asc' | 'desc',
): Grouped[] {
  const sorted = [...items].sort(
    (a, b) => (order === 'asc' ? 1 : -1) * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
  );
  if (key === 'none') return [{ label: '', items: sorted }];

  const map = new Map<string, EventItem[]>();
  for (const item of sorted) {
    const k = formatTime(item.timestamp, key);
    const arr = map.get(k) ?? [];
    arr.push(item);
    map.set(k, arr);
  }
  const entries = [...map.entries()];
  if (order === 'desc') entries.reverse();
  return entries.map(([label, groupItems]) => ({ label, items: groupItems }));
}

export function EventTimeline({
  items,
  typeMeta,
  defaultColor = FALLBACK_COLOR,
  groupBy = 'day',
  order = 'desc',
  filterTypes,
  onFilterTypesChange,
  showFilter = false,
  onClickItem,
  loading = false,
  hasMore = false,
  onLoadMore,
  emptyState,
  ariaLabel,
  className,
  height = '100vh',
}: EventTimelineProps) {
  const filtered = useMemo(() => {
    if (!filterTypes || filterTypes.length === 0) return items;
    return items.filter((e) => filterTypes.includes(e.type));
  }, [items, filterTypes]);

  const groups = useMemo(() => groupAndSort(filtered, groupBy, order), [filtered, groupBy, order]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) set.add(item.type);
    return [...set].filter((t) => typeMeta[t]?.label);
  }, [items, typeMeta]);

  const toggleType = (t: EventType) => {
    if (!onFilterTypesChange) return;
    const curr = filterTypes ?? availableTypes;
    if (curr.includes(t)) {
      const next = curr.filter((x) => x !== t);
      onFilterTypesChange(next.length === 0 ? availableTypes : next);
    } else {
      onFilterTypesChange([...curr, t]);
    }
  };

  const rootStyle: Record<string, string> = {
    height: typeof height === 'number' ? `${height * 2}rpx` : height,
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <View className={`et-mp-timeline ${className ?? ''}`} style={rootStyle} aria-label={ariaLabel ?? '事件时间线'}>
      {showFilter && availableTypes.length > 1 && (
        <View style={{ flexShrink: 0, padding: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {availableTypes.map((t) => {
            const active = !filterTypes || filterTypes.includes(t);
            const meta = typeMeta[t];
            return (
              <Tag
                key={t}
                type={active ? 'primary' : 'default'}
                color={meta?.color}
                onClick={() => toggleType(t)}
              >
                {meta?.label ?? t}
              </Tag>
            );
          })}
        </View>
      )}

      <ScrollView style={{ flex: 1 }} scrollY>
        {groups.length === 0 && !loading ? (
          <View style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
            {emptyState ?? <Text>暂无事件</Text>}
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.label}>
              {group.label && (
                <View
                  style={{
                    padding: '8px 16px',
                    background: '#fafafa',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#666',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <Text>{group.label}</Text>
                </View>
              )}
              {group.items.map((item) => {
                const meta = typeMeta[item.type];
                const color = meta?.color ?? defaultColor;
                return (
                  <View
                    key={item.id}
                    style={{ padding: '12px 16px', display: 'flex', gap: '12px' }}
                    onClick={() => onClickItem?.(item)}
                  >
                    {/* Timeline line + dot */}
                    <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px', flexShrink: 0 }}>
                      <View
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: color,
                          marginTop: '4px',
                        }}
                      />
                    </View>
                    {/* Content */}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'flex-start' }}>
                        {item.actor?.avatar && (
                          <Image
                            src={item.actor.avatar}
                            style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0 }}
                            mode='aspectFill'
                          />
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: '14px', fontWeight: 500 }}>{item.title}</Text>
                          {item.body && (
                            <View style={{ marginTop: '4px' }}>
                              <Text style={{ fontSize: '13px', color: '#666' }}>{item.body}</Text>
                            </View>
                          )}
                          <View style={{ marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <Text style={{ fontSize: '11px', color: '#999' }}>{formatTimeShort(item.timestamp)}</Text>
                            {meta?.label && (
                              <Text style={{ fontSize: '11px', color }}>{meta.label}</Text>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}

        {hasMore && (
          <View style={{ padding: '16px', textAlign: 'center' }}>
            <Button size='small' loading={loading} onClick={onLoadMore}>
              {loading ? '加载中…' : '加载更多'}
            </Button>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
