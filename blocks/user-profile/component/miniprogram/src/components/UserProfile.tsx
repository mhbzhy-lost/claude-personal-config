import { View, Text, Image, ScrollView } from '@tarojs/components';
import { useState } from 'react';
import type { UserProfileProps, UserProfileData } from '../types';

const STAT_LABELS: Record<string, string> = {
  posts: '帖子',
  followers: '粉丝',
  following: '关注',
};

export function UserProfile({
  data,
  tabs,
  activeTabKey,
  onTabChange,
  onFollow,
  onUnfollow,
  onEdit,
  headerExtra,
  className,
  height = '100vh',
}: UserProfileProps) {
  const [internalTab, setInternalTab] = useState<string | undefined>();
  const tabKey = activeTabKey ?? internalTab ?? tabs?.[0]?.key;
  const [followingState, setFollowingState] = useState(data?.is_following);

  if (!data) {
    return (
      <View
        className={`up-mp-shell ${className ?? ''}`}
        style={{ height: typeof height === 'number' ? `${height * 2}rpx` : height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#999', fontSize: '28rpx' }}>暂无用户数据</Text>
      </View>
    );
  }

  const handleFollow = () => {
    setFollowingState(true);
    void onFollow?.(data.id);
  };

  const handleUnfollow = () => {
    setFollowingState(false);
    void onUnfollow?.(data.id);
  };

  const isFollowing = followingState ?? data.is_following;

  return (
    <View
      className={`up-mp-shell ${className ?? ''}`}
      style={{
        height: typeof height === 'number' ? `${height * 2}rpx` : height,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <ScrollView scrollY style={{ flex: 1 }}>
        {/* Cover */}
        <View
          className='up-mp-cover'
          style={{
            width: '100%',
            height: '280rpx',
            background: data.cover ? 'transparent' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {data.cover && (
            <Image src={data.cover} mode='aspectFill' style={{ width: '100%', height: '100%' }} />
          )}
        </View>

        {/* Header */}
        <View
          className='up-mp-header'
          style={{ padding: '0 32rpx 24rpx', position: 'relative' }}
        >
          {/* Avatar */}
          <View
            style={{
              width: '128rpx',
              height: '128rpx',
              borderRadius: '50%',
              border: '4rpx solid #fff',
              marginTop: '-64rpx',
              overflow: 'hidden',
              background: '#f0f0f0',
            }}
          >
            {data.avatar ? (
              <Image src={data.avatar} mode='aspectFill' style={{ width: '100%', height: '100%' }} aria-label='用户头像' />
            ) : (
              <View style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8e8e8' }}>
                <Text style={{ fontSize: '48rpx' }}>👤</Text>
              </View>
            )}
          </View>

          {/* Name + handle + verified */}
          <View style={{ marginTop: '16rpx', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12rpx' }}>
            <Text style={{ fontSize: '36rpx', fontWeight: 700 }}>{data.name}</Text>
            {data.verified && (
              <Text style={{ fontSize: '28rpx', color: '#1677ff' }}>✓</Text>
            )}
            {data.handle && (
              <Text style={{ fontSize: '26rpx', color: '#999' }}>@{data.handle}</Text>
            )}
          </View>

          {/* Bio */}
          {data.bio && (
            <View style={{ marginTop: '12rpx' }}>
              <Text style={{ fontSize: '28rpx', color: '#333', lineHeight: 1.6 }}>{data.bio}</Text>
            </View>
          )}

          {/* Meta */}
          <View style={{ display: 'flex', flexDirection: 'row', gap: '24rpx', marginTop: '16rpx', flexWrap: 'wrap' }}>
            {data.location && (
              <Text style={{ fontSize: '24rpx', color: '#666' }}>📍 {data.location}</Text>
            )}
            {data.website && (
              <Text style={{ fontSize: '24rpx', color: '#1677ff' }}>🔗 {data.website.replace(/^https?:\/\//, '')}</Text>
            )}
            {data.joined_at && (
              <Text style={{ fontSize: '24rpx', color: '#666' }}>🗓 加入于 {new Date(data.joined_at).getFullYear()}</Text>
            )}
          </View>

          {/* Stats */}
          <View
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '40rpx',
              marginTop: '24rpx',
              padding: '20rpx 0',
              borderTop: '1px solid #f0f0f0',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            {Object.entries(data.stats).map(([k, v]) => {
              if (v === undefined) return null;
              return (
                <View key={k} style={{ alignItems: 'center' }} aria-label={`${STAT_LABELS[k] ?? k} ${v}`}>
                  <Text style={{ fontSize: '32rpx', fontWeight: 700 }}>{v}</Text>
                  <Text style={{ fontSize: '22rpx', color: '#999' }}>{STAT_LABELS[k] ?? k}</Text>
                </View>
              );
            })}
          </View>

          {/* Actions */}
          <View style={{ display: 'flex', flexDirection: 'row', gap: '16rpx', marginTop: '20rpx', alignItems: 'center' }}>
            {data.is_self && onEdit && (
              <View
                onClick={onEdit}
                aria-label='编辑资料'
                style={{
                  padding: '12rpx 32rpx',
                  borderRadius: '12rpx',
                  border: '1px solid #d9d9d9',
                  background: '#fff',
                }}
              >
                <Text style={{ fontSize: '28rpx', color: '#333' }}>编辑资料</Text>
              </View>
            )}
            {!data.is_self && isFollowing && onUnfollow && (
              <View
                onClick={handleUnfollow}
                aria-label='取消关注'
                style={{
                  padding: '12rpx 32rpx',
                  borderRadius: '12rpx',
                  border: '1px solid #d9d9d9',
                  background: '#fff',
                }}
              >
                <Text style={{ fontSize: '28rpx', color: '#333' }}>已关注</Text>
              </View>
            )}
            {!data.is_self && !isFollowing && onFollow && (
              <View
                onClick={handleFollow}
                aria-label='关注'
                style={{
                  padding: '12rpx 32rpx',
                  borderRadius: '12rpx',
                  background: '#1677ff',
                }}
              >
                <Text style={{ fontSize: '28rpx', color: '#fff' }}>关注</Text>
              </View>
            )}
            {headerExtra && (
              <View>{headerExtra}</View>
            )}
          </View>
        </View>

        {/* Tabs */}
        {tabs && tabs.length > 0 && (
          <View>
            <View
              style={{
                display: 'flex',
                flexDirection: 'row',
                borderBottom: '1px solid #f0f0f0',
                padding: '0 16rpx',
              }}
            >
              {tabs.map((t) => {
                const active = t.key === tabKey;
                return (
                  <View
                    key={t.key}
                    onClick={() => {
                      setInternalTab(t.key);
                      onTabChange?.(t.key);
                    }}
                    style={{
                      padding: '20rpx 24rpx',
                      borderBottom: active ? '3rpx solid #1677ff' : '3rpx solid transparent',
                      marginBottom: '-2rpx',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: '28rpx',
                        fontWeight: active ? 600 : 400,
                        color: active ? '#1677ff' : '#666',
                      }}
                    >
                      {t.label}
                      {t.count !== undefined ? ` · ${t.count}` : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={{ minHeight: '200rpx' }}>
              {tabs.find((t) => t.key === tabKey)?.render() ?? (
                <View style={{ padding: '40rpx', textAlign: 'center' }}>
                  <Text style={{ color: '#999', fontSize: '28rpx' }}>暂无内容</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
