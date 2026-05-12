import { Avatar, Typography } from 'antd';
import type { Peer } from '../types';
import { formatLastSeen } from '../utils/time';

interface Props {
  peer: Peer | null;
  wsConnected: boolean;
}

export function ChatHeader({ peer, wsConnected }: Props) {
  if (!peer) {
    return (
      <div className="chat-header">
        <div className="chat-header-row">
          <Avatar size={40}>?</Avatar>
          <div className="chat-header-meta">
            <Typography.Text type="secondary">加载中…</Typography.Text>
          </div>
        </div>
      </div>
    );
  }
  const dotColor =
    peer.online_status === 'online' ? '#52c41a'
    : peer.online_status === 'away' ? '#faad14'
    : '#bfbfbf';
  return (
    <div className="chat-header">
      <div className="chat-header-row">
        <div className="chat-header-avatar">
          <Avatar size={40} src={peer.avatar_url ?? undefined}>
            {peer.name.slice(0, 1).toUpperCase()}
          </Avatar>
          <span className="chat-header-status-dot" style={{ background: dotColor }} />
        </div>
        <div className="chat-header-meta">
          <div className="chat-header-name">
            {peer.name}
            {!wsConnected && <span className="chat-header-offline">离线</span>}
          </div>
          {peer.bio && (
            <div className="chat-header-bio" title={peer.bio}>
              {peer.bio}
            </div>
          )}
          <div className="chat-header-presence">
            {formatLastSeen(peer.last_seen_at, peer.online_status)}
          </div>
        </div>
      </div>
    </div>
  );
}
