import { View, Text } from '@tarojs/components';
import { formatTime } from '../utils/time';
import type { Message, Peer, User } from '../types';

interface Props {
  message: Message;
  isMine: boolean;
  peer: Peer | null;
  me: User | null;
  onRecall?: () => void;
}

function previewContent(m: Message) {
  const c = m.content;
  if (c.kind === 'recall') return <Text className='chat-bubble-recall'>[消息已撤回]</Text>;
  if (c.kind === 'text') return c.text;
  if (c.kind === 'image') return <View className='chat-bubble-image-placeholder'>[图片]</View>;
  if (c.kind === 'file') return `📎 ${c.name}`;
  return null;
}

export function MessageBubble({ message, isMine, peer, me, onRecall }: Props) {
  const recalled = message.content.kind === 'recall';
  const user = isMine ? me : peer;
  const className = [
    'chat-bubble',
    isMine ? 'chat-bubble-mine' : 'chat-bubble-peer',
    recalled ? 'chat-bubble-recalled' : '',
  ].filter(Boolean).join(' ');

  return (
    <View className={className}>
      {!isMine && (
        <View className='chat-bubble-avatar'>
          <Text>{user?.name?.slice(0, 1).toUpperCase() ?? '?'}</Text>
        </View>
      )}
      <View className='chat-bubble-stack'>
        <View className='chat-bubble-content'>
          <Text>{previewContent(message)}</Text>
        </View>
        <View className='chat-bubble-meta'>
          <Text className='chat-bubble-time'>{formatTime(message.sent_at)}</Text>
          {isMine && !recalled && (
            <>
              <Text className='chat-bubble-status'>
                {message.status === 'sending' && '发送中'}
                {message.status === 'sent' && '✓'}
                {message.status === 'delivered' && '✓✓'}
                {message.status === 'read' && '✓✓'}
                {message.status === 'failed' && '⚠ 失败'}
              </Text>
              {onRecall && message.status !== 'sending' && (
                <View className='chat-bubble-recall-btn' onClick={onRecall}>
                  <Text>撤回</Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );
}
