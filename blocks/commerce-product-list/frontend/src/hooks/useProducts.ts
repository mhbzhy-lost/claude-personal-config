import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { CplClient } from '../api/client';
import type {
  CplConfig,
  ProductFilters,
  ProductWithState,
  Ulid,
  UseProductsResult,
  User,
  UserProductState,
} from '../types';

interface State {
  items: ProductWithState[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  loading: boolean;
  error: Error | null;
}

const initial: State = {
  items: [],
  total: 0,
  page: 0,
  pageSize: 20,
  hasMore: true,
  loading: false,
  error: null,
};

type Action =
  | { type: 'reset'; pageSize: number }
  | { type: 'load_start' }
  | { type: 'load_ok'; items: ProductWithState[]; total: number; page: number; pageSize: number; hasMore: boolean; reset: boolean }
  | { type: 'load_err'; err: Error }
  | { type: 'patch_state'; productId: Ulid; state: UserProductState };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'reset':
      return { ...initial, pageSize: a.pageSize };
    case 'load_start':
      return { ...s, loading: true, error: null };
    case 'load_ok':
      return {
        ...s,
        loading: false,
        total: a.total,
        page: a.page,
        pageSize: a.pageSize,
        hasMore: a.hasMore,
        items: a.reset ? a.items : [...s.items, ...a.items],
      };
    case 'load_err':
      return { ...s, loading: false, error: a.err };
    case 'patch_state':
      return {
        ...s,
        items: s.items.map((p) =>
          p.id === a.productId ? { ...p, user_state: a.state } : p
        ),
      };
  }
}

export function useProducts(
  config: CplConfig,
  initialFilters: ProductFilters = {}
): UseProductsResult {
  const client = useMemo(() => new CplClient(config), [config]);
  const pageSize = config.pageSize ?? 20;
  const [filters, setFiltersState] = useState<ProductFilters>(initialFilters);
  const [state, dispatch] = useReducer(reducer, { ...initial, pageSize });
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    if (!config.auth) return;
    client.getMe().then(setMe).catch(() => undefined);
  }, [client, config.auth]);

  const fetchPage = useCallback(
    async (page: number, reset: boolean) => {
      dispatch({ type: 'load_start' });
      try {
        const result = await client.listProducts({
          ...filters,
          page,
          page_size: pageSize,
        });
        dispatch({
          type: 'load_ok',
          items: result.items,
          total: result.total,
          page: result.page,
          pageSize: result.page_size,
          hasMore: result.has_more,
          reset,
        });
      } catch (err) {
        dispatch({ type: 'load_err', err: err as Error });
      }
    },
    [client, filters, pageSize]
  );

  // Reset & fetch when filters change.
  useEffect(() => {
    dispatch({ type: 'reset', pageSize });
    void fetchPage(1, true);
  }, [fetchPage, pageSize]);

  const loadMore = useCallback(async () => {
    if (!state.hasMore || state.loading) return;
    await fetchPage(state.page + 1, false);
  }, [state.hasMore, state.loading, state.page, fetchPage]);

  const refresh = useCallback(() => fetchPage(1, true), [fetchPage]);

  const setFilters = useCallback((next: Partial<ProductFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...next }));
  }, []);

  const setFavorite = useCallback(
    async (id: Ulid, value: boolean) => {
      const ups = await client.setFavorite(id, value);
      dispatch({ type: 'patch_state', productId: id, state: ups });
    },
    [client]
  );

  const setCartCount = useCallback(
    async (id: Ulid, count: number) => {
      const ups = await client.setCartCount(id, count);
      dispatch({ type: 'patch_state', productId: id, state: ups });
    },
    [client]
  );

  return {
    items: state.items,
    loading: state.loading,
    error: state.error,
    total: state.total,
    hasMore: state.hasMore,
    loadMore,
    refresh,
    filters,
    setFilters,
    setFavorite,
    setCartCount,
    me,
  };
}
