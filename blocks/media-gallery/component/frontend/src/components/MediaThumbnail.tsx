import { PlayCircleOutlined } from '@ant-design/icons';
import type { MediaItem } from '../types';

interface MediaThumbnailProps {
  item: MediaItem;
  onClick: () => void;
}

function formatDuration(s: number): string {
  const total = Math.floor(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function MediaThumbnail({ item, onClick }: MediaThumbnailProps) {
  const src = item.thumb ?? item.url;
  const isVideo = item.kind === 'video';
  return (
    <div
      className="mg-thumb"
      role="button"
      tabIndex={0}
      aria-label={item.alt ?? (isVideo ? '播放视频' : '查看图片')}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <img className="mg-thumb__img" src={src} alt={item.alt ?? ''} loading="lazy" />
      {isVideo && (
        <span className="mg-thumb__play" aria-hidden>
          <PlayCircleOutlined />
        </span>
      )}
      {isVideo && item.duration !== undefined && (
        <span className="mg-thumb__duration" aria-hidden>
          {formatDuration(item.duration)}
        </span>
      )}
    </div>
  );
}
