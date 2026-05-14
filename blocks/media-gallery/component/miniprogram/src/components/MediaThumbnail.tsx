import { View, Image, Text } from '@tarojs/components';
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
    <View
      className='mg-mp-thumb'
      onClick={onClick}
      aria-label={`${item.alt ?? item.id}${isVideo ? ' 视频' : ''}`}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: item.width && item.height ? `${item.width}/${item.height}` : '1/1',
        overflow: 'hidden',
        borderRadius: '8rpx',
        background: '#f0f0f0',
      }}
    >
      <Image
        className='mg-mp-thumb__img'
        src={src}
        mode='aspectFill'
        style={{ width: '100%', height: '100%' }}
      />
      {isVideo && (
        <View
          className='mg-mp-thumb__play'
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '50%',
            width: '64rpx',
            height: '64rpx',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: '32rpx', color: '#fff' }}>▶</Text>
        </View>
      )}
      {isVideo && item.duration !== undefined && (
        <View
          className='mg-mp-thumb__duration'
          style={{
            position: 'absolute',
            bottom: '8rpx',
            right: '8rpx',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            fontSize: '20rpx',
            padding: '2rpx 8rpx',
            borderRadius: '4rpx',
          }}
        >
          <Text>{formatDuration(item.duration)}</Text>
        </View>
      )}
    </View>
  );
}
