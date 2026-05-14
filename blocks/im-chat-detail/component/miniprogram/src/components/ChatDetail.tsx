import { useEffect, useRef } from 'react';
import { View, ScrollView, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { ChatHeader } from './ChatHeader';
import { Composer } from './Composer';
import { DateDivider } from './DateDivider';
import { MessageBubble } from './MessageBubble';
import { useChat } from '../hooks/useChat';
import type { BlockConfig, Message, Ulid } from '../types';

export interface ChatDetailProps {
  config: BlockConfig;
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
  const scrollRef = useRef<string>('');
  const lastSeenIdRef = useRef<string | null>(null);

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
  }, [chat.messages, chat.me, chat.markRead]);

  const onScrollToUpper = () => {
    if (chat.loading || !chat.hasMore) return;
    void chat.loadMore();
  };

  return (
    <View className='chat-detail'>
      <ChatHeader peer={chat.peer} wsConnected={chat.wsConnected} />
        <ScrollView
        className='chat-detail-scroll'
        scrollY
        scrollWithAnimation
        scrollIntoView={scrollRef.current}
        onScrollToUpper={onScrollToUpper}
        upperThreshold={40}
        aria-label='聊天消息'
      >
        {chat.loading && chat.messages.length === 0 && (
          <View className='chat-loading'>
            <Text>加载中...</Text>
          </View>
        )}
        {chat.error && chat.messages.length === 0 && (
          <View className='chat-empty'>
            <Text>{chat.error.message}</Text>
          </View>
        )}
        {chat.hasMore && chat.messages.length > 0 && (
          <View
            className='chat-loading-more'
            onClick={() => { if (!chat.loading) void chat.loadMore(); }}
          >
            <Text>{chat.loading ? '加载中...' : '加载更早'}</Text>
          </View>
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
                        .catch((e) => Taro.showToast({ title: (e as Error).message, icon: 'none' }));
                    }
                  : undefined
              }
            />
          )
        )}
      </ScrollView>
      <Composer
        onSend={async (text) => {
          try {
            await chat.send({ kind: 'text', text });
          } catch (e) {
            Taro.showToast({ title: (e as Error).message, icon: 'none' });
            throw e;
          }
        }}
      />
    </View>
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
