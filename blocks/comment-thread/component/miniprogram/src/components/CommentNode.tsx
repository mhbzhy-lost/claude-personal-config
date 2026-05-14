import { useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
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
    <View className='ct-node' style={`margin-left: ${comment.depth === 0 ? 0 : 72}rpx`}>
      <View className='ct-node-row'>
        <View className='ct-node-avatar'>
          {comment.author.avatar_url ? (
            <Image className='ct-avatar-img' src={comment.author.avatar_url} mode='aspectFill' />
          ) : (
            <Text>{comment.author.name.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <View className='ct-node-body'>
          <View className='ct-node-head'>
            <Text className='ct-node-name'>
              {comment.is_deleted ? '[已删除]' : comment.author.name}
            </Text>
            <Text className='ct-node-time'>{formatRelative(comment.created_at)}</Text>
          </View>
          <Text className='ct-node-content'>
            {comment.is_deleted ? '该评论已删除' : comment.content}
          </Text>
          {!comment.is_deleted && (
            <View className='ct-node-actions'>
              {canShowReply && (
                <View className='ct-node-act' onClick={() => setReplyOpen((o) => !o)} aria-label={replyOpen ? '取消回复' : '回复'}>
                  <Text>{replyOpen ? '取消' : '回复'}</Text>
                </View>
              )}
              {isAuthor && (
                <View className='ct-node-act ct-node-act-danger' onClick={() => void onDelete(comment.id)} aria-label='删除评论'>
                  <Text>删除</Text>
                </View>
              )}
            </View>
          )}
          {replyOpen && (
            <CommentComposer
              autoFocus
              placeholder={`回复 ${comment.author.name}...`}
              onSubmit={async (t) => {
                await onReply(t, comment.id);
                setReplyOpen(false);
              }}
              onCancel={() => setReplyOpen(false)}
            />
          )}
        </View>
      </View>
      {replies.length > 0 && (
        <View className='ct-replies'>
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
        </View>
      )}
    </View>
  );
}
