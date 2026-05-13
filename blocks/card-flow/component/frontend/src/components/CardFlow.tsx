import type { CSSProperties } from 'react';
import { useResponsiveColumns } from '../hooks/useResponsiveColumns';
import type { CardFlowProps } from '../types';

/**
 * CardFlow — UI chrome for "a list of cards".
 *
 * Three layout modes:
 *   - 'grid'      equal-height cells in N-column CSS grid (catalog / shop)
 *   - 'waterfall' masonry via CSS column-count (Pinterest-like; natural
 *                 height per card, fills column-by-column not by-shortest)
 *   - 'single'    1 column, vertical stack (feed / timeline)
 *
 * Zero data ownership: host passes `items` + `renderItem`. Empty / loading
 * / header / footer slots are render-prop holes; host owns load-more,
 * pagination, search etc.
 */
export function CardFlow<T>({
  items,
  getItemId,
  renderItem,
  mode = 'grid',
  columns,
  gap = 16,
  emptyState,
  header,
  footer,
  loading = false,
  onScroll,
  ariaLabel = '卡片列表',
  className,
  height = '100%',
}: CardFlowProps<T>) {
  const effectiveColumns = useResponsiveColumns(mode === 'single' ? 1 : columns);

  const rootStyle: CSSProperties = {
    height,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const bodyStyle: CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: gap,
  };

  const containerStyle: CSSProperties =
    mode === 'grid'
      ? {
          display: 'grid',
          gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))`,
          gap,
        }
      : mode === 'waterfall'
        ? {
            columnCount: effectiveColumns,
            columnGap: gap,
          }
        : {
            display: 'flex',
            flexDirection: 'column',
            gap,
          };

  const cardWrapperStyle: CSSProperties | undefined =
    mode === 'waterfall'
      ? { breakInside: 'avoid', marginBottom: gap, display: 'block' }
      : undefined;

  const showEmpty = !loading && items.length === 0;

  return (
    <div
      className={['cf-card-flow', `cf-card-flow--${mode}`, className].filter(Boolean).join(' ')}
      style={rootStyle}
      data-mode={mode}
    >
      {header ? <div className="cf-card-flow__header">{header}</div> : null}
      <div
        className="cf-card-flow__body"
        style={bodyStyle}
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        onScroll={onScroll}
      >
        {showEmpty ? (
          <div className="cf-card-flow__empty">{emptyState ?? null}</div>
        ) : (
          <div className="cf-card-flow__container" style={containerStyle}>
            {items.map((item) => {
              const id = getItemId(item);
              return (
                <div key={id} className="cf-card-flow__cell" style={cardWrapperStyle}>
                  {renderItem(item)}
                </div>
              );
            })}
          </div>
        )}
        {footer ? <div className="cf-card-flow__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
