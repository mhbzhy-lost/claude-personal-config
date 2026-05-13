import { useCallback, useState } from 'react';
import { Empty } from 'antd';
import { CardFlow } from '@cf/card-flow';
import { MediaThumbnail } from './MediaThumbnail';
import { Viewer } from './Viewer';
import type { MediaGalleryProps, MediaItem } from '../types';

/**
 * Media gallery: thumbnails grid (consumed via @cf/card-flow) + full-screen
 * viewer with keyboard nav + optional metadata sidebar. Images + videos mixed.
 *
 * Zero data ownership: host gives `items`. selectedIndex can be controlled
 * (URL-driven deep link) or left internal.
 */
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
  height = '100%',
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
    <div
      className={['mg-shell', className].filter(Boolean).join(' ')}
      style={{ height }}
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
        emptyState={emptyState ?? <Empty description="暂无媒体" />}
      />
      <Viewer
        items={items}
        selectedIndex={selected}
        onSelectChange={setSelected}
        showSidebar={showSidebar}
        renderSidebar={renderSidebar}
        onDownload={onDownload}
      />
    </div>
  );
}
