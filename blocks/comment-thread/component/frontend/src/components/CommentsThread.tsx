import { useMemo } from 'react';
import { App, Empty, Result, Skeleton, Typography } from 'antd';
import { useComments } from '../hooks/useComments';
import type { BlockConfig, Comment, Ulid } from '../types';
import { CommentComposer } from './CommentComposer';
import { CommentNode } from './CommentNode';

export interface CommentsThreadProps {
  config: BlockConfig;
  /** Host resource type (e.g. "article" / "product" / "order"). */
  resourceType: string;
  /** Host resource ULID. */
  resourceId: Ulid;
}

export function CommentsThread({ config, resourceType, resourceId }: CommentsThreadProps) {
  const c = useComments(config, resourceType, resourceId);
  const { message } = App.useApp();

  // Group comments by parent_comment_id, preserving server order.
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
    <div className="ct-thread">
      <div className="ct-thread-head">
        <Typography.Title level={5} style={{ margin: 0 }}>
          评论 {c.total > 0 ? `(${c.total})` : ''}
        </Typography.Title>
      </div>

      {canPost ? (
        <CommentComposer
          onSubmit={async (text) => {
            try {
              await c.post(text);
            } catch (e) {
              message.error((e as Error).message);
              throw e;
            }
          }}
        />
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          登录后即可评论。
        </Typography.Text>
      )}

      <div className="ct-thread-list">
        {c.loading && c.comments.length === 0 && <Skeleton active paragraph={{ rows: 3 }} />}
        {c.error && c.comments.length === 0 && (
          <Result status="error" title="加载评论失败" subTitle={c.error.message} />
        )}
        {!c.loading && !c.error && roots.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有评论" />
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
                message.error((e as Error).message);
                throw e;
              }
            }}
            onDelete={async (id) => {
              try {
                await c.remove(id);
                message.success('已删除');
              } catch (e) {
                message.error((e as Error).message);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
