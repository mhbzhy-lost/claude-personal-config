import { useEffect, useMemo, useState } from 'react';
import { BlockClient } from '../api/client';
import type { BlockConfig, ProductDetailData } from '../types';

export interface UseProductDetailResult {
  data: ProductDetailData | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useProductDetail(
  config: BlockConfig | undefined,
  productId: string | undefined,
): UseProductDetailResult {
  const client = useMemo(() => (config ? new BlockClient(config) : null), [config]);
  const [data, setData] = useState<ProductDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!client || !productId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .getProduct(productId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e as Error))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [client, productId, tick]);

  return {
    data,
    loading,
    error,
    refresh: () => setTick((n) => n + 1),
  };
}
