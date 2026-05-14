import { View, ScrollView } from '@tarojs/components';
import { useCallback } from 'react';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import type { MasterDetailProps } from '../types';

/**
 * Master-Detail container for mini programs.
 * Pure UI chrome — host owns items, selection, and rendering.
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
  ariaListLabel,
  ariaDetailLabel,
  className,
  height = '100vh',
}: MasterDetailProps<T>) {
  const resolved = useResponsiveLayout(layout, splitBreakpoint);
  const isSplit = resolved === 'split';

  const handleBack = useCallback(() => onSelect(null), [onSelect]);

  const showListEmpty = !loading && items.length === 0;
  const showSplitPlaceholder = isSplit && selectedId == null;

  const rootStyle: Record<string, string> = {
    height: typeof height === 'number' ? `${height}rpx` : height,
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
  };

  const listStyle: Record<string, string> = isSplit
    ? {
        flex: `${splitRatio[0]}`,
        minWidth: '0',
        borderRight: '1px solid #f0f0f0',
      }
    : {
        flex: '1',
        minWidth: '0',
        display: selectedId == null ? 'flex' : 'none',
      };

  const detailStyle: Record<string, string> = isSplit
    ? { flex: `${splitRatio[1]}`, minWidth: '0', display: 'flex', flexDirection: 'column' }
    : {
        flex: '1',
        minWidth: '0',
        display: selectedId != null ? 'flex' : 'none',
        flexDirection: 'column',
      };

  return (
    <View
      className={`md-mp-master-detail md-mp-master-detail--${resolved} ${className ?? ''}`}
      style={rootStyle}
    >
      <ScrollView className='md-mp-master-detail__list' style={listStyle} scrollY aria-label={ariaListLabel ?? '列表'} aria-busy={loading || undefined}>
        {showListEmpty ? (
          <View className='md-mp-master-detail__empty'>{emptyList ?? null}</View>
        ) : (
          items.map((item) => {
            const id = getItemId(item);
            const selected = id === selectedId;
            return (
              <View
                key={id}
                className={
                  'md-mp-master-detail__row' +
                  (selected ? ' md-mp-master-detail__row--selected' : '')
                }
                onClick={() => onSelect(id)}
              >
                {renderItem(item, selected)}
              </View>
            );
          })
        )}
      </ScrollView>

      <View className='md-mp-master-detail__detail' style={detailStyle} aria-label={ariaDetailLabel ?? '详情'}>
        {!isSplit && selectedId != null && renderBackButton ? (
          <View className='md-mp-master-detail__back'>{renderBackButton(handleBack)}</View>
        ) : null}
        <ScrollView className='md-mp-master-detail__detail-body' style={{ flex: 1 }} scrollY>
          {selectedId != null ? (
            renderDetail(selectedId)
          ) : showSplitPlaceholder ? (
            <View className='md-mp-master-detail__placeholder'>{placeholder ?? null}</View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}
