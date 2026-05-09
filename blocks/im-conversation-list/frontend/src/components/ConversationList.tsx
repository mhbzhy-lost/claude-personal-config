import { useCallback, useRef } from 'react';
import { App, Button, Empty, Result, Skeleton, Spin } from 'antd';
import { ConversationItem } from './ConversationItem';
import { ContextMenu } from './ContextMenu';
import { SearchBar } from './SearchBar';
import { useConversations } from '../hooks/useConversations';
import type { Conversation, ImclConfig } from '../types';

export interface ConversationListProps {
  config: ImclConfig;
  /** Currently selected conversation id (controlled). */
  selectedId?: string | null;
  /** Called when the user picks a conversation. */
  onSelect?: (c: Conversation) => void;
  /** Optional: react to WS connection state changes. */
  onWsStateChange?: (connected: boolean) => void;
  /** Override the default empty state (rare). */
  renderEmpty?: () => React.ReactNode;
}

const STYLE_HOST: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: '#fff',
};

const STYLE_HEADER: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #f0f0f0',
};

const STYLE_SCROLL: React.CSSProperties = { flex: 1, overflowY: 'auto' };

export function ConversationList({
  config,
  selectedId = null,
  onSelect,
  renderEmpty,
}: ConversationListProps) {
  const conv = useConversations(config);
  const { message } = App.useApp();
  const scrollRef = useRef<HTMLDivElement>(null);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || conv.loading || !conv.hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      void conv.loadMore();
    }
  }, [conv]);

  const locale = config.locale ?? {};
  const emptyText = conv.search ? locale.emptySearch ?? '未找到匹配会话' : locale.empty ?? '暂无会话';
  const errMsg = locale.error ?? '加载失败';
  const retryText = locale.retry ?? '重试';

  return (
    <div className="imcl-list" style={STYLE_HOST} role="region" aria-label="会话列表">
      <div className="imcl-list-header" style={STYLE_HEADER}>
        <SearchBar value={conv.search} onChange={conv.setSearch} />
      </div>
      {conv.error && conv.items.length === 0 && (
        <Result
          status="error"
          title={errMsg}
          subTitle={conv.error.message}
          extra={
            <Button type="primary" onClick={() => void conv.refresh()}>
              {retryText}
            </Button>
          }
        />
      )}
      {conv.loading && conv.items.length === 0 && (
        <div style={{ padding: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} avatar paragraph={{ rows: 1 }} active style={{ padding: 8 }} />
          ))}
        </div>
      )}
      {!conv.loading && !conv.error && conv.items.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {renderEmpty?.() ?? <Empty description={emptyText} />}
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={STYLE_SCROLL}
        role="listbox"
        aria-label="会话列表内容"
      >
        {conv.items.map((c) => (
          <ContextMenu
            key={c.id}
            conversation={c}
            onPin={(v) =>
              conv
                .pin(c.id, v)
                .then(() => message.success(v ? '已置顶' : '已取消置顶'))
                .catch((e) => message.error((e as Error).message))
            }
            onMute={(v) =>
              conv
                .mute(c.id, v)
                .then(() => message.success(v ? '已免打扰' : '已取消免打扰'))
                .catch((e) => message.error((e as Error).message))
            }
            onMarkRead={() => {
              if (c.last_message) void conv.markRead(c.id, c.last_message.id);
            }}
            onDelete={() =>
              conv
                .remove(c.id)
                .then(() => message.success('已删除'))
                .catch((e) => message.error((e as Error).message))
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
          <div style={{ padding: 16, textAlign: 'center' }}>
            <Spin />
          </div>
        )}
      </div>
    </div>
  );
}
