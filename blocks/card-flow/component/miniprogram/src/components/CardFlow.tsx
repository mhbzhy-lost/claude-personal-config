import { View, ScrollView } from '@tarojs/components';
import { useMemo } from 'react';
import { useResponsiveColumns } from '../hooks/useResponsiveColumns';
import type { CardFlowProps } from '../types';

const PX_TO_RPX = 2;

/**
 * CardFlow — UI chrome for "a list of cards" in mini programs.
 *
 * Three layout modes:
 *   - 'grid'      equal-width cells in flex-wrap grid (catalog / shop)
 *   - 'waterfall' JS-based multi-column masonry (Pinterest-like)
 *   - 'single'    1 column, vertical stack (feed / timeline)
 *
 * Zero data ownership: host passes `items` + `renderItem`.
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
  className,
  ariaLabel = '卡片列表',
  height = '100vh',
}: CardFlowProps<T>) {
  const effectiveColumns = useResponsiveColumns(mode === 'single' ? 1 : columns);
  const gapRpx = gap * PX_TO_RPX;

  const waterfallCols = useMemo(() => {
    if (mode !== 'waterfall') return null;
    const cols: T[][] = Array.from({ length: effectiveColumns }, () => []);
    items.forEach((item, i) => {
      cols[i % effectiveColumns].push(item);
    });
    return cols;
  }, [mode, items, effectiveColumns]);

  const showEmpty = !loading && items.length === 0;

  const rootStyle: Record<string, string> = {
    height: typeof height === 'number' ? `${height * PX_TO_RPX}rpx` : height,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const gridItemStyle: Record<string, string> = {
    width: `calc((100% - ${(effectiveColumns - 1) * gapRpx}rpx) / ${effectiveColumns})`,
    marginBottom: `${gapRpx}rpx`,
  };

  const waterfallColStyle: Record<string, string> = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: `${gapRpx}rpx`,
  };

  const waterfallColMargin: Record<string, string> = {
    marginLeft: `${gapRpx / 2}rpx`,
    marginRight: `${gapRpx / 2}rpx`,
  };

  const scrollStyle: Record<string, string> = {
    flex: 1,
    padding: `${gapRpx}rpx`,
    boxSizing: 'border-box' as const,
  };

  return (
    <View
      className={`cf-mp-card-flow cf-mp-card-flow--${mode} ${className ?? ''}`}
      style={rootStyle}
    >
      {header ? <View className='cf-mp-card-flow__header'>{header}</View> : null}

      <ScrollView
        className='cf-mp-card-flow__body'
        style={scrollStyle}
        scrollY
        onScroll={onScroll}
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
      >
        {showEmpty ? (
          <View className='cf-mp-card-flow__empty'>{emptyState ?? null}</View>
        ) : mode === 'waterfall' && waterfallCols ? (
          <View style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
            {waterfallCols.map((col, ci) => (
              <View
                key={ci}
                style={{
                  ...waterfallColStyle,
                  ...(ci === 0
                    ? { marginLeft: '0rpx', marginRight: `${gapRpx / 2}rpx` }
                    : ci === effectiveColumns - 1
                      ? { marginLeft: `${gapRpx / 2}rpx`, marginRight: '0rpx' }
                      : waterfallColMargin),
                }}
              >
                {col.map((item) => (
                  <View key={getItemId(item)} className='cf-mp-card-flow__cell'>
                    {renderItem(item)}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : mode === 'grid' ? (
          <View
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
            }}
          >
            {items.map((item) => (
              <View
                key={getItemId(item)}
                className='cf-mp-card-flow__cell'
                style={gridItemStyle}
              >
                {renderItem(item)}
              </View>
            ))}
          </View>
        ) : (
          <View style={{ display: 'flex', flexDirection: 'column', gap: `${gapRpx}rpx` }}>
            {items.map((item) => (
              <View
                key={getItemId(item)}
                className='cf-mp-card-flow__cell'
                style={{ width: '100%' }}
              >
                {renderItem(item)}
              </View>
            ))}
          </View>
        )}

        {footer ? <View className='cf-mp-card-flow__footer'>{footer}</View> : null}
      </ScrollView>
    </View>
  );
}
