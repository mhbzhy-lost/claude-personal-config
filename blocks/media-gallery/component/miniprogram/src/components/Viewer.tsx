import { View, Image, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
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
    <View>
      {item.alt && (
        <View style={{ fontSize: '32rpx', fontWeight: 600, marginBottom: '16rpx' }}>
          <Text>{item.alt}</Text>
        </View>
      )}
      {item.description && (
        <View style={{ fontSize: '28rpx', color: '#666', marginBottom: '16rpx' }}>
          <Text>{item.description}</Text>
        </View>
      )}
      {entries.length > 0 && (
        <View>
          {entries.map(([k, v]) => (
            <View
              key={k}
              style={{
                display: 'flex',
                flexDirection: 'row',
                padding: '12rpx 0',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <Text style={{ fontSize: '24rpx', color: '#999', width: '120rpx', flexShrink: 0 }}>{k}</Text>
              <Text style={{ fontSize: '24rpx', color: '#333', flex: 1 }}>{v}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
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

  const goto = (delta: number) => {
    if (selectedIndex === null) return;
    const n = items.length;
    if (n === 0) return;
    const next = ((selectedIndex + delta) % n + n) % n;
    onSelectChange(next);
  };

  if (!open && selectedIndex !== null) return null;
  if (!open) return null;

  const handleDownload = () => {
    if (!onDownload || !item) return;
    Taro.showLoading({ title: '下载中…' });
    onDownload(item);
    Taro.hideLoading();
  };

  return (
    <View
      className='mg-mp-viewer-overlay'
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <View
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20rpx 24rpx',
          flexShrink: 0,
        }}
      >
        <Text
          style={{ fontSize: '32rpx', color: '#fff' }}
          onClick={() => onSelectChange(null)}
          aria-label="关闭"
        >
          ✕ 关闭
        </Text>
        <Text style={{ fontSize: '28rpx', color: 'rgba(255,255,255,0.7)' }} aria-label={`第${(selectedIndex ?? 0) + 1}张，共${items.length}张`}>
          {(selectedIndex ?? 0) + 1} / {items.length}
        </Text>
          {onDownload && (
          <Text
            style={{ fontSize: '28rpx', color: '#fff' }}
            onClick={handleDownload}
            aria-label="下载"
          >
            📥 下载
          </Text>
        )}
      </View>

      {/* Stage */}
      <View
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Prev nav */}
        <View
          onClick={() => goto(-1)}
          aria-label="上一张"
          style={{
            width: '80rpx',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Text style={{ fontSize: '48rpx', color: 'rgba(255,255,255,0.8)' }}>‹</Text>
        </View>

        {/* Media */}
        <View style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {item.kind === 'image' ? (
            <Image
              src={item.url}
              mode='aspectFit'
              style={{ width: '100%', height: '60vh' }}
            />
          ) : (
            <View style={{ width: '100%', textAlign: 'center' }}>
              <Text style={{ color: '#fff', fontSize: '28rpx' }}>
                📹 视频 · {item.duration ? `${Math.floor(item.duration)}秒` : ''}
              </Text>
              <Text
                style={{ color: '#1677ff', fontSize: '28rpx', display: 'block', marginTop: '20rpx' }}
                onClick={() => {
                  Taro.setClipboardData({ data: item.url });
                  Taro.showToast({ title: '链接已复制', icon: 'none' });
                }}
              >
                复制视频链接
              </Text>
            </View>
          )}
        </View>

        {/* Next nav */}
        <View
          onClick={() => goto(1)}
          aria-label="下一张"
          style={{
            width: '80rpx',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Text style={{ fontSize: '48rpx', color: 'rgba(255,255,255,0.8)' }}>›</Text>
        </View>
      </View>

      {/* Sidebar */}
      {showSidebar && item && (
        <View
          style={{
            padding: '24rpx 32rpx',
            background: 'rgba(255,255,255,0.06)',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            maxHeight: '30vh',
            overflow: 'auto',
          }}
        >
          {(renderSidebar ?? defaultSidebar)(item)}
        </View>
      )}
    </View>
  );
}
