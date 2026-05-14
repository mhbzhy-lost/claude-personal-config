import { View, Text } from '@tarojs/components';
import { useCallback, useState } from 'react';
import { CardFlow } from '@cf/card-flow-mp';
import { MediaThumbnail } from './MediaThumbnail';
import { Viewer } from './Viewer';
import type { MediaGalleryProps, MediaItem } from '../types';

export function MediaGallery({
  items,
  loading,
  layout = 'grid',
  columns,
  gap = 12,
  selectedIndex: selectedProp,
  onSelectChange,
  showSidebar = true,
  renderSidebar,
  onDownload,
  emptyState,
  ariaLabel = '媒体画廊',
  className,
  height = '100vh',
}: MediaGalleryProps) {
  const [selectedInternal, setSelectedInternal] = useState<number | null>(null);
  const selected = selectedProp ?? selectedInternal;
  const setSelected = useCallback(
    (v: number | null) => {
      if (selectedProp === undefined) setSelectedInternal(v);
      onSelectChange?.(v);
    },
    [selectedProp, onSelectChange],
  );

  return (
    <View
      className={`mg-mp-shell ${className ?? ''}`}
      style={{ height: typeof height === 'number' ? `${height * 2}rpx` : height }}
      aria-label={ariaLabel}
    >
      <CardFlow<MediaItem>
        items={items}
        getItemId={(it) => it.id}
        renderItem={(it) => (
          <MediaThumbnail
            item={it}
            onClick={() => setSelected(items.indexOf(it))}
          />
        )}
        mode={layout}
        columns={columns}
        gap={gap}
        loading={loading}
        emptyState={emptyState ?? (
          <View style={{ padding: '40rpx', textAlign: 'center' }}>
            <Text style={{ color: '#999', fontSize: '28rpx' }}>暂无媒体</Text>
          </View>
        )}
      />
      <Viewer
        items={items}
        selectedIndex={selected}
        onSelectChange={setSelected}
        showSidebar={showSidebar}
        renderSidebar={renderSidebar}
        onDownload={onDownload}
      />
    </View>
  );
}
