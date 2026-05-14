import { View, Text, Image } from '@tarojs/components';
import type { Conversation, User } from '../types';
import { previewText, smartTime } from '../utils/time';

interface Props {
  conversation: Conversation;
  selected: boolean;
  meId: string | null;
  onClick: () => void;
}

export function ConversationItem({ conversation, selected, meId, onClick }: Props) {
  const peer: User | null =
    conversation.type === 'direct'
      ? conversation.participants.find((p) => p.id !== meId) ??
        conversation.participants[0] ??
        null
      : null;
  const displayName =
    conversation.title ?? peer?.name ?? `(${conversation.participant_count} 人)`;
  const avatarUrl = conversation.avatar_url ?? peer?.avatar_url ?? undefined;
  const initials = displayName.slice(0, 1).toUpperCase();
  const className = [
    'imcl-item',
    conversation.is_pinned ? 'imcl-item-pinned' : '',
    selected ? 'imcl-item-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <View className={className} onClick={onClick}>
      <View className='imcl-item-row'>
        <View className='imcl-item-avatar'>
          {avatarUrl ? (
            <Image className='imcl-avatar-img' src={avatarUrl} mode='aspectFill' />
          ) : (
            <Text>{initials}</Text>
          )}
        </View>
        <View className='imcl-item-meta'>
          <View className='imcl-item-line'>
            <Text className='imcl-item-name'>{displayName}</Text>
            <Text className='imcl-item-time'>{smartTime(conversation.last_activity_at)}</Text>
          </View>
          <View className='imcl-item-line'>
            <Text className='imcl-item-preview'>
              {conversation.last_message ? previewText(conversation.last_message.content) : ''}
            </Text>
            <View className='imcl-item-suffix'>
              {conversation.is_muted && <Text className='imcl-flag'>🔕</Text>}
              {conversation.is_pinned && <Text className='imcl-flag imcl-flag-pin'>📌</Text>}
              {!conversation.is_muted && conversation.unread_count > 0 && (
                <View className='imcl-badge'>
                  <Text>{conversation.unread_count > 99 ? '99+' : String(conversation.unread_count)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
