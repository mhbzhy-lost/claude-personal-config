import { useEffect, useMemo, useState } from 'react';
import { BlockClient } from '../api/client';
import type { BlockConfig, UserProfileData } from '../types';

export interface UseUserProfileResult {
  data: UserProfileData | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useUserProfile(
  config: BlockConfig | undefined,
  userId: string | undefined,
): UseUserProfileResult {
  const client = useMemo(() => (config ? new BlockClient(config) : null), [config]);
  const [data, setData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!client || !userId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .getProfile(userId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e as Error))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [client, userId, tick]);

  return { data, loading, error, refresh: () => setTick((n) => n + 1) };
}
