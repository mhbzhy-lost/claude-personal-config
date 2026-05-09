import { Dropdown, type MenuProps } from 'antd';
import type { ReactNode } from 'react';
import type { Conversation } from '../types';

interface Props {
  conversation: Conversation;
  onPin: (value: boolean) => void;
  onMute: (value: boolean) => void;
  onMarkRead: () => void;
  onDelete: () => void;
  children: ReactNode;
}

export function ContextMenu({
  conversation,
  onPin,
  onMute,
  onMarkRead,
  onDelete,
  children,
}: Props) {
  const items: MenuProps['items'] = [
    {
      key: 'pin',
      label: conversation.is_pinned ? '取消置顶' : '置顶',
      onClick: () => onPin(!conversation.is_pinned),
    },
    {
      key: 'mute',
      label: conversation.is_muted ? '取消免打扰' : '免打扰',
      onClick: () => onMute(!conversation.is_muted),
    },
    {
      key: 'read',
      label: '标为已读',
      disabled: conversation.unread_count === 0 || !conversation.last_message,
      onClick: onMarkRead,
    },
    { type: 'divider' },
    { key: 'del', label: '删除会话', danger: true, onClick: onDelete },
  ];

  return (
    <Dropdown menu={{ items }} trigger={['contextMenu']}>
      <div>{children}</div>
    </Dropdown>
  );
}
