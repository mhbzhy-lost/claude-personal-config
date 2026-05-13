import { Avatar, Button, Empty, Spin, Tag } from 'antd';
import { useMemo } from 'react';
import { formatTimeShort, groupAndSort } from '../utils/group';
import type { EventTimelineProps, EventType } from '../types';

const FALLBACK_COLOR = '#8c8c8c';

/**
 * Event-stream timeline with:
 * - Type-keyed icon / color from `typeMeta`
 * - Group by day / month / none (with sticky group headers)
 * - Optional filter pills selecting which types to show
 * - Optional load-more footer
 */
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
  loading,
  hasMore,
  onLoadMore,
  emptyState,
  ariaLabel = '事件时间线',
  className,
  height = '100%',
}: EventTimelineProps) {
  // Effective set of types to show.
  const activeTypes = useMemo<Set<EventType> | null>(() => {
    if (!filterTypes) return null;
    return new Set(filterTypes);
  }, [filterTypes]);

  const visible = useMemo(
    () => (activeTypes ? items.filter((it) => activeTypes.has(it.type)) : items),
    [items, activeTypes],
  );

  const groups = useMemo(
    () => groupAndSort(visible, groupBy, order),
    [visible, groupBy, order],
  );

  const filterKeys = useMemo(() => Object.keys(typeMeta), [typeMeta]);

  return (
    <div
      className={['et-shell', className].filter(Boolean).join(' ')}
      style={{ height, display: 'flex', flexDirection: 'column' }}
      aria-label={ariaLabel}
    >
      {showFilter && filterKeys.length > 0 && (
        <div className="et-filter">
          <span className="et-filter__label">筛选</span>
          {filterKeys.map((k) => {
            const meta = typeMeta[k];
            const active = !activeTypes || activeTypes.has(k);
            return (
              <Tag.CheckableTag
                key={k}
                checked={active}
                onChange={(checked) => {
                  if (!onFilterTypesChange) return;
                  const all = filterKeys;
                  const current = activeTypes ? Array.from(activeTypes) : all;
                  const next = checked
                    ? Array.from(new Set([...current, k]))
                    : current.filter((x) => x !== k);
                  onFilterTypesChange(next);
                }}
                style={active && meta?.color ? { background: meta.color + '20', color: meta.color } : undefined}
              >
                {meta?.label ?? k}
              </Tag.CheckableTag>
            );
          })}
        </div>
      )}

      <div className="et-body">
        {loading && visible.length === 0 ? (
          <div className="et-empty">
            <Spin />
          </div>
        ) : visible.length === 0 ? (
          <div className="et-empty">{emptyState ?? <Empty description="暂无事件" />}</div>
        ) : (
          groups.map((g, gi) => (
            <div key={g.label || `g-${gi}`} className="et-group">
              {g.label && (
                <div className="et-group__head">
                  <span>{g.label}</span>
                </div>
              )}
              <div className="et-list" role="list">
                {g.items.map((it) => {
                  const meta = typeMeta[it.type];
                  const color = meta?.color ?? defaultColor;
                  return (
                    <div
                      key={it.id}
                      className={'et-item' + (onClickItem ? ' et-item--clickable' : '')}
                      role={onClickItem ? 'button' : 'listitem'}
                      tabIndex={onClickItem ? 0 : undefined}
                      aria-label={
                        onClickItem && typeof it.title === 'string' ? it.title : undefined
                      }
                      onClick={onClickItem ? () => onClickItem(it) : undefined}
                      onKeyDown={
                        onClickItem
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onClickItem(it);
                              }
                            }
                          : undefined
                      }
                    >
                      <div className="et-item__rail">
                        <span className="et-item__dot" style={{ borderColor: color, color }}>
                          {meta?.icon}
                        </span>
                      </div>
                      <div className="et-item__body">
                        <div className="et-item__row1">
                          {it.actor?.avatar && <Avatar src={it.actor.avatar} size={20} />}
                          {it.actor && <span className="et-item__actor">{it.actor.name}</span>}
                          <span className="et-item__title">{it.title}</span>
                          <span className="et-item__time">{formatTimeShort(it.timestamp)}</span>
                        </div>
                        {it.body && <div className="et-item__detail">{it.body}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {hasMore && onLoadMore && (
          <div className="et-loadmore">
            <Button type="link" loading={loading} onClick={onLoadMore}>
              加载更多
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
