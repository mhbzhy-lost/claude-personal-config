import { useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import type { BlockClient } from '../api/client';
import type { WsEvent } from '../types';

export function useConversationsWebSocket(
  client: BlockClient,
  onEvent: (e: WsEvent) => void,
  onGap: () => void
): { connected: boolean } {
  const handlerRef = useRef(onEvent);
  const gapRef = useRef(onGap);
  handlerRef.current = onEvent;
  gapRef.current = onGap;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let alive = true;
    let task: Taro.SocketTask | null = null;
    let backoff = 1000;
    let lastSeq = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      if (!alive) return;
      try {
        const url = await client.wsUrl();
        task = Taro.connectSocket({ url });
      } catch {
        timer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
        return;
      }
      task.onOpen(() => {
        backoff = 1000;
        setConnected(true);
      });
      task.onMessage((m) => {
        try {
          const ev = JSON.parse(typeof m.data === 'string' ? m.data : '') as WsEvent;
          if (typeof ev.seq === 'number') {
            if (lastSeq && ev.seq > lastSeq + 1) gapRef.current();
            lastSeq = ev.seq;
          }
          handlerRef.current(ev);
        } catch {
          /* ignore malformed */
        }
      });
      task.onClose(() => {
        setConnected(false);
        lastSeq = 0;
        if (!alive) return;
        timer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
      });
      task.onError(() => {
        task?.close({});
      });
    }

    void connect();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      task?.close({});
    };
  }, [client]);

  return { connected };
}
