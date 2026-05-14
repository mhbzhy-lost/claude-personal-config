import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import type { Conversation } from '../types';

interface Props {
  conversation: Conversation;
  onPin: (value: boolean) => void;
  onMute: (value: boolean) => void;
  onMarkRead: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

export function ContextMenu({
  conversation,
  onPin,
  onMute,
  onMarkRead,
  onDelete,
  children,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <View className='imcl-context-wrap'>
      {children}
      <View
        className={`imcl-context-trigger ${visible ? 'imcl-context-trigger-active' : ''}`}
        onClick={() => setVisible(!visible)}
        aria-label='更多操作'
      >
        <Text>···</Text>
      </View>
      {visible && (
        <>
          <View className='imcl-context-mask' onClick={() => setVisible(false)} />
          <View className='imcl-context-menu'>
            <View
              className='imcl-context-item'
              onClick={() => { onPin(!conversation.is_pinned); setVisible(false); }}
            >
              <Text>{conversation.is_pinned ? '取消置顶' : '置顶'}</Text>
            </View>
            <View
              className='imcl-context-item'
              onClick={() => { onMute(!conversation.is_muted); setVisible(false); }}
            >
              <Text>{conversation.is_muted ? '取消免打扰' : '免打扰'}</Text>
            </View>
            <View
              className='imcl-context-item'
              onClick={() => { onMarkRead(); setVisible(false); }}
            >
              <Text>标为已读</Text>
            </View>
            <View className='imcl-context-divider' />
            <View
              className='imcl-context-item imcl-context-item-danger'
              onClick={() => { onDelete(); setVisible(false); }}
            >
              <Text>删除会话</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
