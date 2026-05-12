import { useCallback, useEffect, useMemo, useState } from 'react';
import { BlockClient } from '../api/client';
import type { BlockConfig, OrderDetail } from '../types';

export interface UseOrderResult {
  order: OrderDetail | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  cancel: (reason?: string) => Promise<void>;
  requestRefund: (reason: string) => Promise<void>;
}

export function useOrder(config: BlockConfig, orderId: string | null): UseOrderResult {
  const client = useMemo(() => new BlockClient(config), [config]);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!orderId) {
      setOrder(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setOrder(await client.getOrder(orderId));
    } catch (err) {
      setError(err as Error);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [client, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = useCallback(
    async (reason?: string) => {
      if (!orderId) return;
      setOrder(await client.cancelOrder(orderId, reason));
    },
    [client, orderId]
  );

  const requestRefund = useCallback(
    async (reason: string) => {
      if (!orderId) return;
      setOrder(await client.requestRefund(orderId, reason));
    },
    [client, orderId]
  );

  return { order, loading, error, refresh: load, cancel, requestRefund };
}
