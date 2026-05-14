import { useMemo } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useComments } from '../hooks/useComments';
import type { BlockConfig, Comment, Ulid } from '../types';
import { CommentComposer } from './CommentComposer';
import { CommentNode } from './CommentNode';

export interface CommentsThreadProps {
  config: BlockConfig;
  resourceType: string;
  resourceId: Ulid;
}

export function CommentsThread({ config, resourceType, resourceId }: CommentsThreadProps) {
  const c = useComments(config, resourceType, resourceId);

  const { roots, childrenMap } = useMemo(() => {
    const map = new Map<Ulid, Comment[]>();
    const rootList: Comment[] = [];
    for (const comment of c.comments) {
      const parent = comment.parent_comment_id;
      if (!parent) {
        rootList.push(comment);
      } else {
        const arr = map.get(parent) ?? [];
        arr.push(comment);
        map.set(parent, arr);
      }
    }
    return { roots: rootList, childrenMap: map };
  }, [c.comments]);

  const canPost = !!config.auth;

  return (
    <View className='ct-thread'>
      <View className='ct-thread-head'>
        <Text className='ct-thread-title'>
          评论 {c.total > 0 ? `(${c.total})` : ''}
        </Text>
      </View>

      {canPost ? (
        <CommentComposer
          onSubmit={async (text) => {
            try {
              await c.post(text);
            } catch (e) {
              Taro.showToast({ title: (e as Error).message, icon: 'none' });
              throw e;
            }
          }}
        />
      ) : (
        <Text className='ct-thread-hint'>登录后即可评论。</Text>
      )}

      <View className='ct-thread-list' aria-label='评论'>
        {c.loading && c.comments.length === 0 && (
          <View className='ct-loading'><Text>加载中...</Text></View>
        )}
        {c.error && c.comments.length === 0 && (
          <View className='ct-error'><Text>加载评论失败: {c.error.message}</Text></View>
        )}
        {!c.loading && !c.error && roots.length === 0 && (
          <View className='ct-empty'><Text>还没有评论</Text></View>
        )}
        {roots.map((root) => (
          <CommentNode
            key={root.id}
            comment={root}
            replies={childrenMap.get(root.id) ?? []}
            childrenMap={childrenMap}
            me={c.me}
            canReply={canPost}
            onReply={async (content, parentId) => {
              try {
                await c.post(content, parentId);
              } catch (e) {
                Taro.showToast({ title: (e as Error).message, icon: 'none' });
                throw e;
              }
            }}
            onDelete={async (id) => {
              try {
                await c.remove(id);
                Taro.showToast({ title: '已删除', icon: 'none' });
              } catch (e) {
                Taro.showToast({ title: (e as Error).message, icon: 'none' });
              }
            }}
          />
        ))}
      </View>
    </View>
  );
}
