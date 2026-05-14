import { useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { BlockClient } from '../api/client';
import type { WsEvent } from '../types';

export function useChatWebSocket(
  client: BlockClient,
  onEvent: (e: WsEvent) => void
): { connected: boolean } {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let alive = true;
    let task: Taro.SocketTask | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;

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
        setConnected(true);
        backoff = 1000;
      });
      task.onMessage((res) => {
        try {
          handlerRef.current(JSON.parse(typeof res.data === 'string' ? res.data : '') as WsEvent);
        } catch { /* ignore */ }
      });
      task.onClose(() => {
        setConnected(false);
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
