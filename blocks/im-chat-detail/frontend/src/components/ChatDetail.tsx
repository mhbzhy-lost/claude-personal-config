import { useEffect, useLayoutEffect, useRef } from 'react';
import { App, Button, Empty, Skeleton, Spin } from 'antd';
import { ChatHeader } from './ChatHeader';
import { Composer } from './Composer';
import { DateDivider } from './DateDivider';
import { MessageBubble } from './MessageBubble';
import { useChat } from '../hooks/useChat';
import { useTokenStyle } from '../utils/tokenStyle';
import type { BlockConfig, Message, Ulid } from '../types';

export interface ChatDetailProps {
  config: BlockConfig;
  /** Peer's user ID. The conversation is implicitly (me, peer). */
  peerId: Ulid;
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function ChatDetail({ config, peerId }: ChatDetailProps) {
  const chat = useChat(config, peerId);
  const { message } = App.useApp();
  const tokenStyle = useTokenStyle();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSeenIdRef = useRef<string | null>(null);

  // Auto-scroll to bottom on initial load + every new message append.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.messages.length]);

  // Mark messages read when they arrive.
  useEffect(() => {
    if (!chat.me) return;
    const last = chat.messages[chat.messages.length - 1];
    if (!last) return;
    if (last.recipient_id !== chat.me.id) return;
    if (last.status === 'read') return;
    if (lastSeenIdRef.current === last.id) return;
    lastSeenIdRef.current = last.id;
    void chat.markRead(last.id).catch(() => undefined);
  }, [chat.messages, chat.me, chat.markRead, chat]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || chat.loading || !chat.hasMore) return;
    if (el.scrollTop < 40) void chat.loadMore();
  };

  return (
    <div className="chat-detail" style={tokenStyle}>
      <ChatHeader peer={chat.peer} wsConnected={chat.wsConnected} />
      <div ref={scrollRef} className="chat-detail-scroll" onScroll={onScroll}>
        {chat.loading && chat.messages.length === 0 && (
          <Skeleton active paragraph={{ rows: 4 }} style={{ padding: 16 }} />
        )}
        {chat.error && chat.messages.length === 0 && (
          <Empty description={chat.error.message} />
        )}
        {chat.hasMore && chat.messages.length > 0 && (
          <div className="chat-loading-more">
            {chat.loading ? <Spin size="small" /> : <Button type="link" size="small" onClick={() => void chat.loadMore()}>加载更早</Button>}
          </div>
        )}
        {renderWithDateDividers(
          chat.messages,
          chat.me?.id ?? null,
          (m, isMine) => (
            <MessageBubble
              key={m.id}
              message={m}
              isMine={isMine}
              peer={chat.peer}
              me={chat.me}
              onRecall={
                isMine && m.content.kind !== 'recall'
                  ? () => {
                      chat
                        .recall(m.id)
                        .catch((e) => message.error((e as Error).message));
                    }
                  : undefined
              }
            />
          )
        )}
      </div>
      <Composer
        onSend={async (text) => {
          try {
            await chat.send({ kind: 'text', text });
          } catch (e) {
            message.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

function renderWithDateDividers(
  messages: Message[],
  meId: string | null,
  render: (m: Message, isMine: boolean) => React.ReactNode
): React.ReactNode {
  const out: React.ReactNode[] = [];
  let prev: Message | null = null;
  for (const m of messages) {
    if (!prev || !sameDay(prev.sent_at, m.sent_at)) {
      out.push(<DateDivider key={`div-${m.id}`} iso={m.sent_at} />);
    }
    out.push(render(m, m.sender_id === meId));
    prev = m;
  }
  return out;
}
