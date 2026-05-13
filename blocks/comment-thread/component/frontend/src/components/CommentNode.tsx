import { useState } from 'react';
import { Avatar, Button, Typography } from 'antd';
import { CommentComposer } from './CommentComposer';
import type { Comment, Ulid, User } from '../types';

interface Props {
  comment: Comment;
  replies: Comment[];
  childrenMap: Map<Ulid, Comment[]>;
  me: User | null;
  canReply: boolean;
  onReply: (content: string, parentId: Ulid) => Promise<void>;
  onDelete: (id: Ulid) => Promise<void>;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
  return d.toISOString().slice(0, 10);
}

export function CommentNode({
  comment,
  replies,
  childrenMap,
  me,
  canReply,
  onReply,
  onDelete,
}: Props) {
  const [replyOpen, setReplyOpen] = useState(false);
  const isAuthor = me?.id === comment.author.id;
  const canShowReply = canReply && !comment.is_deleted && comment.depth < 3;
  return (
    <div className="ct-node" style={{ marginLeft: comment.depth === 0 ? 0 : 36 }}>
      <div className="ct-node-row">
        <Avatar src={comment.author.avatar_url ?? undefined} size={32}>
          {comment.author.name.slice(0, 1).toUpperCase()}
        </Avatar>
        <div className="ct-node-body">
          <div className="ct-node-head">
            <span className="ct-node-name">{comment.is_deleted ? '[已删除]' : comment.author.name}</span>
            <span className="ct-node-time">{formatRelative(comment.created_at)}</span>
          </div>
          <Typography.Text className="ct-node-content">
            {comment.is_deleted ? <i style={{ color: '#999' }}>该评论已删除</i> : comment.content}
          </Typography.Text>
          {!comment.is_deleted && (
            <div className="ct-node-actions">
              {canShowReply && (
                <Button type="link" size="small" onClick={() => setReplyOpen((o) => !o)}>
                  {replyOpen ? '取消' : '回复'}
                </Button>
              )}
              {isAuthor && (
                <Button
                  type="link"
                  size="small"
                  danger
                  onClick={() => void onDelete(comment.id)}
                >
                  删除
                </Button>
              )}
            </div>
          )}
          {replyOpen && (
            <CommentComposer
              // eslint-disable-next-line jsx-a11y/no-autofocus -- reply composer auto-focuses when opening; see a11y-exceptions.md
              autoFocus
              placeholder={`回复 ${comment.author.name}……`}
              onSubmit={async (t) => {
                await onReply(t, comment.id);
                setReplyOpen(false);
              }}
              onCancel={() => setReplyOpen(false)}
            />
          )}
        </div>
      </div>
      {replies.length > 0 && (
        <div className="ct-replies">
          {replies.map((r) => (
            <CommentNode
              key={r.id}
              comment={r}
              replies={childrenMap.get(r.id) ?? []}
              childrenMap={childrenMap}
              me={me}
              canReply={canReply}
              onReply={onReply}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
