import { useCallback, useRef } from 'react';
import { View, ScrollView, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { ConversationItem } from './ConversationItem';
import { ContextMenu } from './ContextMenu';
import { SearchBar } from './SearchBar';
import { useConversations } from '../hooks/useConversations';
import type { Conversation, BlockConfig } from '../types';

export interface ConversationListProps {
  config: BlockConfig;
  selectedId?: string | null;
  onSelect?: (c: Conversation) => void;
  renderEmpty?: () => React.ReactNode;
}

export function ConversationList({
  config,
  selectedId = null,
  onSelect,
  renderEmpty,
}: ConversationListProps) {
  const conv = useConversations(config);
  const scrollRef = useRef<{ scrollTop: number }>({ scrollTop: 0 });

  const onScrollToLower = useCallback(() => {
    if (conv.loading || !conv.hasMore) return;
    void conv.loadMore();
  }, [conv]);

  const locale = config.locale ?? {};
  const emptyText = conv.search ? locale.emptySearch ?? '未找到匹配会话' : locale.empty ?? '暂无会话';
  const errMsg = locale.error ?? '加载失败';
  const retryText = locale.retry ?? '重试';

  return (
    <View className='imcl-list'>
      <View className='imcl-list-header'>
        <SearchBar value={conv.search} onChange={conv.setSearch} />
      </View>
      {conv.error && conv.items.length === 0 && (
        <View className='imcl-error'>
          <Text>{errMsg}: {conv.error.message}</Text>
          <View className='imcl-error-btn' onClick={() => void conv.refresh()}>
            <Text>{retryText}</Text>
          </View>
        </View>
      )}
      {conv.loading && conv.items.length === 0 && (
        <View className='imcl-loading'>
          <Text>加载中...</Text>
        </View>
      )}
      {!conv.loading && !conv.error && conv.items.length === 0 && (
        <View className='imcl-empty'>
          {renderEmpty?.() ?? <Text>{emptyText}</Text>}
        </View>
      )}
      <ScrollView
        className='imcl-scroll'
        scrollY
        scrollTop={scrollRef.current.scrollTop}
        onScrollToLower={onScrollToLower}
        lowerThreshold={80}
        aria-label='会话列表'
      >
        {conv.items.map((c) => (
          <ContextMenu
            key={c.id}
            conversation={c}
            onPin={(v) =>
              conv
                .pin(c.id, v)
                .then(() => Taro.showToast({ title: v ? '已置顶' : '已取消置顶', icon: 'none' }))
                .catch((e) => Taro.showToast({ title: (e as Error).message, icon: 'none' }))
            }
            onMute={(v) =>
              conv
                .mute(c.id, v)
                .then(() => Taro.showToast({ title: v ? '已免打扰' : '已取消免打扰', icon: 'none' }))
                .catch((e) => Taro.showToast({ title: (e as Error).message, icon: 'none' }))
            }
            onMarkRead={() => {
              if (c.last_message) void conv.markRead(c.id, c.last_message.id);
            }}
            onDelete={() =>
              conv
                .remove(c.id)
                .then(() => Taro.showToast({ title: '已删除', icon: 'none' }))
                .catch((e) => Taro.showToast({ title: (e as Error).message, icon: 'none' }))
            }
          >
            <ConversationItem
              conversation={c}
              selected={selectedId === c.id}
              meId={conv.me?.id ?? null}
              onClick={() => onSelect?.(c)}
            />
          </ContextMenu>
        ))}
        {conv.loading && conv.items.length > 0 && (
          <View className='imcl-loading-more'>
            <Text>加载中...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
