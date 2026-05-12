import { useEffect, useRef, useState } from 'react';
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
    let ws: WebSocket | null = null;
    let timer: number | null = null;
    let backoff = 1000;

    async function connect() {
      if (!alive) return;
      try {
        const url = await client.wsUrl();
        ws = new WebSocket(url);
      } catch {
        timer = window.setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
        return;
      }
      ws.onopen = () => {
        setConnected(true);
        backoff = 1000;
      };
      ws.onmessage = (m) => {
        try {
          handlerRef.current(JSON.parse(m.data) as WsEvent);
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!alive) return;
        timer = window.setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
      ws.onerror = () => ws?.close();
    }
    void connect();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
      ws?.close();
    };
  }, [client]);

  return { connected };
}
