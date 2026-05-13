import { Button, Modal } from 'antd';
import { DownloadOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useCallback, useEffect } from 'react';
import type { MediaItem } from '../types';

interface ViewerProps {
  items: MediaItem[];
  selectedIndex: number | null;
  onSelectChange: (idx: number | null) => void;
  showSidebar: boolean;
  renderSidebar?: (item: MediaItem) => React.ReactNode;
  onDownload?: (item: MediaItem) => void;
}

function defaultSidebar(item: MediaItem): React.ReactNode {
  const entries = Object.entries(item.meta ?? {});
  return (
    <div>
      {item.alt && <div className="mg-side__title">{item.alt}</div>}
      {item.description && <div className="mg-side__desc">{item.description}</div>}
      {entries.length > 0 && (
        <dl className="mg-side__meta">
          {entries.map(([k, v]) => (
            <div key={k} className="mg-side__meta-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function Viewer({
  items,
  selectedIndex,
  onSelectChange,
  showSidebar,
  renderSidebar,
  onDownload,
}: ViewerProps) {
  const open = selectedIndex !== null && selectedIndex >= 0 && selectedIndex < items.length;
  const item = open ? items[selectedIndex] : null;

  const goto = useCallback(
    (delta: number) => {
      if (selectedIndex === null) return;
      const n = items.length;
      if (n === 0) return;
      const next = ((selectedIndex + delta) % n + n) % n;
      onSelectChange(next);
    },
    [selectedIndex, items.length, onSelectChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goto(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goto(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, goto]);

  if (!item) {
    return (
      <Modal open={false} onCancel={() => onSelectChange(null)} footer={null}>
        <span />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onCancel={() => onSelectChange(null)}
      footer={null}
      width="92vw"
      centered
      destroyOnClose
      styles={{ body: { padding: 0 }, mask: { background: 'rgba(0,0,0,0.78)' } }}
      rootClassName="mg-modal"
    >
      <div className="mg-viewer">
        <div className="mg-viewer__main">
          <Button
            type="text"
            className="mg-viewer__nav mg-viewer__nav--prev"
            icon={<LeftOutlined />}
            aria-label="上一个"
            onClick={() => goto(-1)}
          />
          <div className="mg-viewer__stage">
            {item.kind === 'image' ? (
              <img className="mg-viewer__img" src={item.url} alt={item.alt ?? ''} />
            ) : (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- caption track is provided by host content; gallery is a viewport, not the source
              <video className="mg-viewer__video" src={item.url} controls autoPlay />
            )}
          </div>
          <Button
            type="text"
            className="mg-viewer__nav mg-viewer__nav--next"
            icon={<RightOutlined />}
            aria-label="下一个"
            onClick={() => goto(1)}
          />
          {onDownload && (
            <Button
              type="text"
              className="mg-viewer__download"
              icon={<DownloadOutlined />}
              aria-label="下载"
              onClick={() => onDownload(item)}
            />
          )}
          <div className="mg-viewer__counter" aria-live="polite">
            {selectedIndex! + 1} / {items.length}
          </div>
        </div>
        {showSidebar && (
          <aside className="mg-side" aria-label="媒体详情">
            {(renderSidebar ?? defaultSidebar)(item)}
          </aside>
        )}
      </div>
    </Modal>
  );
}
