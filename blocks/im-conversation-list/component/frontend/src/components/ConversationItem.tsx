import { Avatar, Badge, Tooltip, Typography } from 'antd';
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
    <div
      className={className}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="imcl-item-row">
        <Badge
          count={conversation.is_muted ? 0 : conversation.unread_count}
          dot={conversation.is_muted && conversation.unread_count > 0}
          offset={[-4, 4]}
        >
          <Avatar size={44} src={avatarUrl}>{initials}</Avatar>
        </Badge>
        {conversation.unread_count > 0 && (
          <span className="imcl-sr-only">
            {conversation.unread_count} 条未读消息
          </span>
        )}
        <div className="imcl-item-meta">
          <div className="imcl-item-line">
            <span className="imcl-item-name">{displayName}</span>
            <span className="imcl-item-time">{smartTime(conversation.last_activity_at)}</span>
          </div>
          <div className="imcl-item-line">
            <Typography.Text className="imcl-item-preview" type="secondary">
              {conversation.last_message ? previewText(conversation.last_message.content) : ''}
            </Typography.Text>
            <span className="imcl-item-suffix">
              {conversation.is_muted && (
                <Tooltip title="免打扰">
                  <span className="imcl-flag" aria-label="免打扰">🔕</span>
                </Tooltip>
              )}
              {conversation.is_pinned && (
                <Tooltip title="已置顶">
                  <span className="imcl-flag imcl-flag-pin" aria-label="置顶">📌</span>
                </Tooltip>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
