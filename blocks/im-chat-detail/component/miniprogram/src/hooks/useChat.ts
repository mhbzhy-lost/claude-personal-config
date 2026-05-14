import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { BlockClient } from '../api/client';
import type { BlockConfig, Content, Message, Peer, Ulid, User, WsEvent } from '../types';
import { useChatWebSocket } from './useChatWebSocket';

interface State {
  messages: Message[];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  error: Error | null;
}

const initial: State = {
  messages: [],
  cursor: null,
  hasMore: true,
  loading: false,
  error: null,
};

type Action =
  | { type: 'load_start' }
  | { type: 'load_ok'; items: Message[]; cursor: string | null; hasMore: boolean; reset: boolean }
  | { type: 'load_err'; err: Error }
  | { type: 'append'; message: Message }
  | { type: 'replace'; message: Message }
  | { type: 'mark_read'; reader_id: Ulid; up_to_message_id: Ulid };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'load_start':
      return { ...s, loading: true, error: null };
    case 'load_ok': {
      const asc = [...a.items].reverse();
      return {
        ...s,
        loading: false,
        cursor: a.cursor,
        hasMore: a.hasMore,
        messages: a.reset ? asc : [...asc, ...s.messages],
      };
    }
    case 'load_err':
      return { ...s, loading: false, error: a.err };
    case 'append':
      if (s.messages.some((m) => m.id === a.message.id)) return s;
      return { ...s, messages: [...s.messages, a.message] };
    case 'replace':
      return {
        ...s,
        messages: s.messages.map((m) => (m.id === a.message.id ? a.message : m)),
      };
    case 'mark_read': {
      const cutoff = s.messages.find((m) => m.id === a.up_to_message_id);
      if (!cutoff) return s;
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.recipient_id === a.reader_id && m.sent_at <= cutoff.sent_at && m.status !== 'read'
            ? { ...m, status: 'read' as const }
            : m
        ),
      };
    }
  }
}

export interface UseChatResult {
  peer: Peer | null;
  me: User | null;
  messages: Message[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  wsConnected: boolean;
  loadMore: () => Promise<void>;
  send: (content: Content) => Promise<void>;
  recall: (id: Ulid) => Promise<void>;
  markRead: (upToMessageId: Ulid) => Promise<void>;
}

export function useChat(config: BlockConfig, peerId: Ulid): UseChatResult {
  const client = useMemo(() => new BlockClient(config), [config]);
  const pageSize = config.pageSize ?? 30;
  const [state, dispatch] = useReducer(reducer, initial);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    void client.getMe().then(setMe).catch(() => undefined);
  }, [client]);

  useEffect(() => {
    void client.getPeer(peerId).then(setPeer).catch(() => undefined);
  }, [client, peerId]);

  const fetchPage = useCallback(
    async (cursor: string | null, reset: boolean) => {
      dispatch({ type: 'load_start' });
      try {
        const page = await client.listMessagesWith(peerId, { cursor, limit: pageSize });
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
    [client, peerId, pageSize]
  );

  useEffect(() => {
    void fetchPage(null, true);
  }, [fetchPage]);

  const onEvent = useCallback(
    (e: WsEvent) => {
      switch (e.type) {
        case 'message.new':
          if (
            (e.message.sender_id === peerId && e.message.recipient_id === me?.id) ||
            (e.message.sender_id === me?.id && e.message.recipient_id === peerId)
          ) {
            dispatch({ type: 'append', message: e.message });
          }
          break;
        case 'message.updated':
          dispatch({ type: 'replace', message: e.message });
          break;
        case 'message.read':
          dispatch({
            type: 'mark_read',
            reader_id: e.reader_id,
            up_to_message_id: e.up_to_message_id,
          });
          break;
      }
    },
    [me, peerId]
  );

  const { connected: wsConnected } = useChatWebSocket(client, onEvent);

  const loadMore = useCallback(async () => {
    if (!state.hasMore || state.loading) return;
    await fetchPage(state.cursor, false);
  }, [state.hasMore, state.loading, state.cursor, fetchPage]);

  const send = useCallback(
    async (content: Content) => {
      const m = await client.sendMessage(peerId, content);
      dispatch({ type: 'append', message: m });
    },
    [client, peerId]
  );

  const recall = useCallback(
    async (id: Ulid) => {
      const m = await client.recallMessage(id);
      dispatch({ type: 'replace', message: m });
    },
    [client]
  );

  const markRead = useCallback(
    async (upToMessageId: Ulid) => {
      await client.markRead(peerId, upToMessageId);
    },
    [client, peerId]
  );

  return {
    peer, me, messages: state.messages,
    loading: state.loading, error: state.error,
    hasMore: state.hasMore, wsConnected,
    loadMore, send, recall, markRead,
  };
}
