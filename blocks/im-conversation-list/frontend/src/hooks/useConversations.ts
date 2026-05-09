import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { ImclClient } from '../api/client';
import type { Conversation, ImclConfig, UseConversationsResult, User, WsEvent } from '../types';
import { useConversationsWebSocket } from './useConversationsWebSocket';

interface State {
  items: Conversation[];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  error: Error | null;
  searchResults: Conversation[] | null;
}

const initial: State = {
  items: [],
  cursor: null,
  hasMore: true,
  loading: false,
  error: null,
  searchResults: null,
};

type Action =
  | { type: 'load_start' }
  | { type: 'load_ok'; items: Conversation[]; cursor: string | null; hasMore: boolean; reset: boolean }
  | { type: 'load_err'; err: Error }
  | { type: 'search_set'; items: Conversation[] | null }
  | { type: 'patch_one'; conversation: Conversation }
  | { type: 'remove_one'; id: string }
  | { type: 'event'; e: WsEvent };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'load_start': return { ...s, loading: true, error: null };
    case 'load_ok':
      return {
        ...s,
        loading: false,
        cursor: a.cursor,
        hasMore: a.hasMore,
        items: a.reset ? a.items : [...s.items, ...a.items],
      };
    case 'load_err':
      return { ...s, loading: false, error: a.err };
    case 'search_set':
      return { ...s, searchResults: a.items };
    case 'patch_one':
      return {
        ...s,
        items: s.items.map((c) => (c.id === a.conversation.id ? a.conversation : c)),
      };
    case 'remove_one':
      return { ...s, items: s.items.filter((c) => c.id !== a.id) };
    case 'event':
      return applyEvent(s, a.e);
  }
}

function applyEvent(s: State, e: WsEvent): State {
  switch (e.type) {
    case 'message.new': {
      const items = s.items.map((c) =>
        c.id === e.conversation_summary.id
          ? {
              ...c,
              last_message: e.message,
              last_activity_at: e.conversation_summary.last_activity_at,
              unread_count: e.conversation_summary.unread_count,
              updated_at: e.ts,
            }
          : c
      );
      return { ...s, items };
    }
    case 'conversation.created':
      return s.items.some((c) => c.id === e.conversation.id)
        ? s
        : { ...s, items: [e.conversation, ...s.items] };
    case 'conversation.updated':
      return {
        ...s,
        items: s.items.map((c) => (c.id === e.conversation.id ? e.conversation : c)),
      };
    case 'conversation.deleted':
      return { ...s, items: s.items.filter((c) => c.id !== e.conversation_id) };
    default:
      return s;
  }
}

export function useConversations(config: ImclConfig): UseConversationsResult {
  const client = useMemo(() => new ImclClient(config), [config]);
  const pageSize = config.pageSize ?? 20;
  const [state, dispatch] = useReducer(reducer, initial);
  const [me, setMe] = useState<User | null>(null);
  const [search, setSearchState] = useState('');

  useEffect(() => {
    client.getMe().then(setMe).catch(() => undefined);
  }, [client]);

  const fetchPage = useCallback(
    async (cursor: string | null, reset: boolean) => {
      dispatch({ type: 'load_start' });
      try {
        const page = await client.listConversations({ cursor, limit: pageSize });
        dispatch({
          type: 'load_ok',
          items: page.items,
          cursor: page.next_cursor ?? null,
          hasMore: page.has_more,
          reset,
        });
      } catch (err) {
        dispatch({ type: 'load_err', err: err as Error });
      }
    },
    [client, pageSize]
  );

  useEffect(() => {
    void fetchPage(null, true);
  }, [fetchPage]);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      dispatch({ type: 'search_set', items: null });
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const page = await client.searchConversations(q);
        if (!cancelled) dispatch({ type: 'search_set', items: page.items });
      } catch {
        if (!cancelled) dispatch({ type: 'search_set', items: [] });
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [search, client]);

  const onEvent = useCallback((e: WsEvent) => dispatch({ type: 'event', e }), []);
  const onGap = useCallback(() => void fetchPage(null, true), [fetchPage]);
  const { connected: wsConnected } = useConversationsWebSocket(client, onEvent, onGap);

  const loadMore = useCallback(async () => {
    if (!state.hasMore || state.loading) return;
    await fetchPage(state.cursor, false);
  }, [state.hasMore, state.loading, state.cursor, fetchPage]);

  const refresh = useCallback(() => fetchPage(null, true), [fetchPage]);

  const pin = useCallback(
    async (id: string, value: boolean) => {
      const c = await client.patchConversation(id, { is_pinned: value });
      dispatch({ type: 'patch_one', conversation: c });
    },
    [client]
  );

  const mute = useCallback(
    async (id: string, value: boolean) => {
      const c = await client.patchConversation(id, { is_muted: value });
      dispatch({ type: 'patch_one', conversation: c });
    },
    [client]
  );

  const remove = useCallback(
    async (id: string) => {
      await client.deleteConversation(id);
      dispatch({ type: 'remove_one', id });
    },
    [client]
  );

  const markRead = useCallback(
    async (id: string, upToMessageId: string) => {
      await client.markRead(id, upToMessageId);
      const c = await client.getConversation(id);
      dispatch({ type: 'patch_one', conversation: c });
    },
    [client]
  );

  const items = state.searchResults ?? state.items;

  return {
    items,
    loading: state.loading,
    error: state.error,
    hasMore: state.searchResults ? false : state.hasMore,
    loadMore,
    refresh,
    setSearch: setSearchState,
    search,
    pin,
    mute,
    remove,
    markRead,
    me,
    wsConnected,
  };
}
