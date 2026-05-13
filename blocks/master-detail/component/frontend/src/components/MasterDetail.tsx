import { useCallback, type CSSProperties } from 'react';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import type { MasterDetailProps } from '../types';

/**
 * Master-Detail container.
 * Pure UI chrome — no data fetching, no business state. Host owns:
 *   - the `items` array (and how to load / paginate / search it)
 *   - selection (`selectedId` + `onSelect`)
 *   - row & detail rendering (render props)
 *
 * Provides only:
 *   - responsive split ↔ stack layout
 *   - selection ARIA wiring (listbox / option / aria-selected)
 *   - scroll containment + sticky-friendly layout
 */
export function MasterDetail<T>({
  items,
  getItemId,
  selectedId,
  onSelect,
  renderItem,
  renderDetail,
  placeholder,
  emptyList,
  renderBackButton,
  layout = 'auto',
  splitBreakpoint = 768,
  splitRatio = [1, 2],
  loading = false,
  ariaListLabel = '列表',
  ariaDetailLabel = '详情',
  className,
  height = '100%',
}: MasterDetailProps<T>) {
  const resolved = useResponsiveLayout(layout, splitBreakpoint);
  const isSplit = resolved === 'split';

  const handleBack = useCallback(() => onSelect(null), [onSelect]);

  const rootStyle: CSSProperties = {
    height,
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
  };

  const listStyle: CSSProperties = isSplit
    ? { flex: splitRatio[0], minWidth: 0, overflowY: 'auto', borderRight: '1px solid #f0f0f0' }
    : { flex: 1, minWidth: 0, overflowY: 'auto', display: selectedId == null ? 'block' : 'none' };

  const detailStyle: CSSProperties = isSplit
    ? { flex: splitRatio[1], minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }
    : {
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        display: selectedId != null ? 'flex' : 'none',
        flexDirection: 'column',
      };

  const showListEmpty = !loading && items.length === 0;
  const showSplitPlaceholder = isSplit && selectedId == null;

  return (
    <div
      className={['md-master-detail', `md-master-detail--${resolved}`, className]
        .filter(Boolean)
        .join(' ')}
      style={rootStyle}
      data-layout={resolved}
    >
      <div
        role="listbox"
        aria-label={ariaListLabel}
        aria-busy={loading || undefined}
        className="md-master-detail__list"
        style={listStyle}
      >
        {showListEmpty ? (
          <div className="md-master-detail__empty">{emptyList ?? null}</div>
        ) : (
          items.map((item) => {
            const id = getItemId(item);
            const selected = id === selectedId;
            return (
              <div
                key={id}
                role="option"
                aria-selected={selected}
                tabIndex={0}
                className={
                  'md-master-detail__row' + (selected ? ' md-master-detail__row--selected' : '')
                }
                onClick={() => onSelect(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(id);
                  }
                }}
              >
                {renderItem(item, selected)}
              </div>
            );
          })
        )}
      </div>

      <section
        aria-label={ariaDetailLabel}
        className="md-master-detail__detail"
        style={detailStyle}
      >
        {!isSplit && selectedId != null && renderBackButton ? (
          <div className="md-master-detail__back">{renderBackButton(handleBack)}</div>
        ) : null}
        <div className="md-master-detail__detail-body" style={{ flex: 1, overflow: 'auto' }}>
          {selectedId != null ? (
            renderDetail(selectedId)
          ) : showSplitPlaceholder ? (
            <div className="md-master-detail__placeholder">{placeholder ?? null}</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
