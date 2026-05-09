import { useEffect, useRef, useState } from 'react';
import type { ImclClient } from '../api/client';
import type { WsEvent } from '../types';

export function useConversationsWebSocket(
  client: ImclClient,
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
    let ws: WebSocket | null = null;
    let backoff = 1000;
    let lastSeq = 0;
    let timer: number | null = null;

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
        backoff = 1000;
        setConnected(true);
      };
      ws.onmessage = (m) => {
        try {
          const ev = JSON.parse(m.data) as WsEvent;
          if (typeof ev.seq === 'number') {
            if (lastSeq && ev.seq > lastSeq + 1) gapRef.current();
            lastSeq = ev.seq;
          }
          handlerRef.current(ev);
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        lastSeq = 0;
        if (!alive) return;
        timer = window.setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    }

    void connect();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  return { connected };
}
