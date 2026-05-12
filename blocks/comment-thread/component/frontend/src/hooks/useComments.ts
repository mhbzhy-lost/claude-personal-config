import { useCallback, useEffect, useMemo, useState } from 'react';
import { BlockClient } from '../api/client';
import type { BlockConfig, Comment, Ulid, User } from '../types';

export interface UseCommentsResult {
  comments: Comment[];
  total: number;
  loading: boolean;
  error: Error | null;
  me: User | null;
  refresh: () => Promise<void>;
  post: (content: string, parentId?: Ulid | null) => Promise<void>;
  remove: (id: Ulid) => Promise<void>;
}

export function useComments(
  config: BlockConfig,
  resourceType: string,
  resourceId: Ulid
): UseCommentsResult {
  const client = useMemo(() => new BlockClient(config), [config]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    if (!config.auth) return;
    client.getMe().then(setMe).catch(() => undefined);
  }, [client, config.auth]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.listComments(resourceType, resourceId);
      setComments(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [client, resourceType, resourceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const post = useCallback(
    async (content: string, parentId?: Ulid | null) => {
      const c = await client.createComment({
        resource_type: resourceType,
        resource_id: resourceId,
        parent_comment_id: parentId ?? null,
        content,
      });
      setComments((prev) => [...prev, c]);
      setTotal((t) => t + 1);
    },
    [client, resourceType, resourceId]
  );

  const remove = useCallback(
    async (id: Ulid) => {
      await client.deleteComment(id);
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_deleted: true, content: '' } : c))
      );
    },
    [client]
  );

  return { comments, total, loading, error, me, refresh, post, remove };
}
