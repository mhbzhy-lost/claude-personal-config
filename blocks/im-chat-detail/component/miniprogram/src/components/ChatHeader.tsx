import { View, Text, Image } from '@tarojs/components';
import type { Peer } from '../types';
import { formatLastSeen } from '../utils/time';

interface Props {
  peer: Peer | null;
  wsConnected: boolean;
}

export function ChatHeader({ peer, wsConnected }: Props) {
  if (!peer) {
    return (
      <View className='chat-header'>
        <View className='chat-header-row'>
          <View className='chat-header-avatar'>
            <Text>?</Text>
          </View>
          <View className='chat-header-meta'>
            <Text className='chat-header-loading'>加载中...</Text>
          </View>
        </View>
      </View>
    );
  }
  const dotColor =
    peer.online_status === 'online' ? '#52c41a'
    : peer.online_status === 'away' ? '#faad14'
    : '#bfbfbf';
  return (
    <View className='chat-header'>
      <View className='chat-header-row'>
        <View className='chat-header-avatar-wrap'>
          {peer.avatar_url ? (
            <Image className='chat-header-avatar-img' src={peer.avatar_url} mode='aspectFill' />
          ) : (
            <View className='chat-header-avatar'>
              <Text>{peer.name.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <View className='chat-header-status-dot' style={`background: ${dotColor}`} />
        </View>
        <View className='chat-header-meta'>
          <View className='chat-header-name'>
            <Text>{peer.name}</Text>
            {!wsConnected && <Text className='chat-header-offline'>离线</Text>}
          </View>
          {peer.bio && (
            <Text className='chat-header-bio'>{peer.bio}</Text>
          )}
          <Text className='chat-header-presence'>
            {formatLastSeen(peer.last_seen_at, peer.online_status)}
          </Text>
        </View>
      </View>
    </View>
  );
}
