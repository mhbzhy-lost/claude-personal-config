import { Avatar, Tooltip } from 'antd';
import type { Message, Peer, User } from '../types';
import { formatTime } from '../utils/time';

interface Props {
  message: Message;
  isMine: boolean;
  peer: Peer | null;
  me: User | null;
  onRecall?: () => void;
}

function previewContent(m: Message): React.ReactNode {
  const c = m.content;
  if (c.kind === 'recall') return <i className="chat-bubble-recall">[消息已撤回]</i>;
  if (c.kind === 'text') return c.text;
  if (c.kind === 'image') return <img src={c.url} alt={c.alt ?? ''} className="chat-bubble-image" />;
  if (c.kind === 'file') return <span>📎 {c.name}</span>;
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
    <div className={className}>
      {!isMine && (
        <Avatar size={28} src={user?.avatar_url ?? undefined}>
          {user?.name?.slice(0, 1).toUpperCase() ?? '?'}
        </Avatar>
      )}
      <div className="chat-bubble-stack">
        <div className="chat-bubble-content">{previewContent(message)}</div>
        <div className="chat-bubble-meta">
          <Tooltip title={message.sent_at}>
            <span className="chat-bubble-time">{formatTime(message.sent_at)}</span>
          </Tooltip>
          {isMine && !recalled && (
            <>
              <span className="chat-bubble-status">
                {message.status === 'sending' && '发送中'}
                {message.status === 'sent' && '✓'}
                {message.status === 'delivered' && '✓✓'}
                {message.status === 'read' && <span style={{ color: '#1677ff' }}>✓✓</span>}
                {message.status === 'failed' && '⚠ 失败'}
              </span>
              {onRecall && message.status !== 'sending' && (
                <button type="button" className="chat-bubble-recall-btn" onClick={onRecall}>
                  撤回
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
