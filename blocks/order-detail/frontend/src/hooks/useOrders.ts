import { useCallback, useEffect, useMemo, useState } from 'react';
import { BlockClient } from '../api/client';
import type { BlockConfig, OrderStatus, OrderSummary } from '../types';

export interface UseOrdersResult {
  items: OrderSummary[];
  total: number;
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  page: number;
  setStatus: (s: OrderStatus | undefined) => void;
  status: OrderStatus | undefined;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useOrders(config: BlockConfig): UseOrdersResult {
  const client = useMemo(() => new BlockClient(config), [config]);
  const pageSize = config.pageSize ?? 10;
  const [items, setItems] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatusState] = useState<OrderStatus | undefined>(undefined);

  const fetchPage = useCallback(
    async (nextPage: number, reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await client.listOrders({ status, page: nextPage, page_size: pageSize });
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(res.page);
        setHasMore(res.has_more);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    },
    [client, pageSize, status]
  );

  useEffect(() => {
    void fetchPage(1, true);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    await fetchPage(page + 1, false);
  }, [loading, hasMore, page, fetchPage]);

  const refresh = useCallback(() => fetchPage(1, true), [fetchPage]);

  return {
    items, total, loading, error, hasMore, page, status,
    setStatus: setStatusState,
    loadMore, refresh,
  };
}
