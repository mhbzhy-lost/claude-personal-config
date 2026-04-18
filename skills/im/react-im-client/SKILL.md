---
name: react-im-client
description: "React 前端 IM 实现层：基于 Socket.IO + Zustand + Axios 构建即时通讯客户端的 Hooks、Store、UI 组件。协议定义引用 im-protocol-core。"
tech_stack: [react, socketio, im, frontend]
language: [typescript]
capability: [realtime-messaging, websocket, state-management]
---

# React IM 客户端实现指南

> 协议定义（消息类型、会话类型、Socket 事件、数据库 Schema、安全模式、群聊策略、消息可靠性策略）见 `im-protocol-core`，本 skill 仅覆盖 React 前端实现。

> 技术栈：React 18+ / Socket.IO Client 4.x / Zustand / Axios / TypeScript
> 适用场景：在 React 应用中集成即时通讯客户端功能

## 用途

提供 React 前端 IM 客户端的完整实现参考，覆盖 Socket 连接管理、状态管理、消息收发、UI 组件、实时交互、文件上传、离线重连和 REST API 封装。

## 何时使用

- 需要在 React 应用中嵌入即时通讯功能
- 构建客服聊天、团队协作、社交通讯的前端部分
- 需要参考 WebSocket + REST 混合客户端架构的最佳实践

---

## 1. Socket.IO 客户端集成

### 1.1 连接管理 Hook

```typescript
// hooks/useSocket.ts
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket-events';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: TypedSocket | null = null;

/** 获取全局单例 Socket 实例 */
export function getSocket(): TypedSocket | null {
  return socketInstance;
}

/** Socket 连接管理 Hook */
export function useSocket(token: string | null) {
  const socketRef = useRef<TypedSocket | null>(null);

  useEffect(() => {
    if (!token) return;

    // 创建连接（携带 JWT 认证）
    const socket: TypedSocket = io(import.meta.env.VITE_WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],  // 优先 WebSocket，降级 polling
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      // 服务端主动断开（如 token 过期），不自动重连
      if (reason === 'io server disconnect') {
        // 触发重新登录流程
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      // 认证失败时停止重连
      if (error.message === 'AUTH_FAILED') {
        socket.disconnect();
      }
    });

    socketRef.current = socket;
    socketInstance = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      socketInstance = null;
    };
  }, [token]);

  return socketRef;
}
```

### 1.2 Socket 事件监听 Hook

```typescript
// hooks/useSocketEvent.ts
import { useEffect } from 'react';
import { getSocket } from './useSocket';
import type { ServerToClientEvents } from '@/types/socket-events';

/** 类型安全的事件监听 Hook */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
) {
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on(event, handler as any);
    return () => {
      socket.off(event, handler as any);
    };
  }, [event, handler]);
}
```

---

## 2. 状态管理（Zustand）

### 2.1 消息 Store

```typescript
// stores/messageStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Message, MessageStatus } from '@/types/message';

interface MessageState {
  // 以 conversationId 为 key 的消息列表
  messagesByConversation: Record<string, Message[]>;
  // 发送中的消息（clientId -> Message）
  pendingMessages: Map<string, Message>;
  // 是否还有更多历史消息
  hasMore: Record<string, boolean>;
}

interface MessageActions {
  /** 追加新消息（收到或发送确认） */
  addMessage: (conversationId: string, message: Message) => void;
  /** 批量追加历史消息（向前加载） */
  prependMessages: (conversationId: string, messages: Message[]) => void;
  /** 乐观发送消息 */
  sendMessageOptimistic: (conversationId: string, message: Message) => void;
  /** 发送确认（替换临时消息） */
  confirmMessage: (clientId: string, serverMessage: Message) => void;
  /** 发送失败 */
  failMessage: (clientId: string) => void;
  /** 更新消息状态 */
  updateMessageStatus: (messageId: string, status: MessageStatus) => void;
  /** 撤回消息 */
  recallMessage: (conversationId: string, messageId: string) => void;
  /** 设置是否有更多历史消息 */
  setHasMore: (conversationId: string, hasMore: boolean) => void;
}

export const useMessageStore = create<MessageState & MessageActions>()(
  immer((set, get) => ({
    messagesByConversation: {},
    pendingMessages: new Map(),
    hasMore: {},

    addMessage: (conversationId, message) =>
      set((state) => {
        const messages = state.messagesByConversation[conversationId] ?? [];
        // 去重（防止重连后重复推送）
        if (messages.some((m) => m.id === message.id)) return;
        state.messagesByConversation[conversationId] = [...messages, message];
      }),

    prependMessages: (conversationId, newMessages) =>
      set((state) => {
        const existing = state.messagesByConversation[conversationId] ?? [];
        const existingIds = new Set(existing.map((m) => m.id));
        const unique = newMessages.filter((m) => !existingIds.has(m.id));
        state.messagesByConversation[conversationId] = [...unique, ...existing];
      }),

    sendMessageOptimistic: (conversationId, message) =>
      set((state) => {
        const messages = state.messagesByConversation[conversationId] ?? [];
        state.messagesByConversation[conversationId] = [...messages, message];
        state.pendingMessages.set(message.clientId, message);
      }),

    confirmMessage: (clientId, serverMessage) =>
      set((state) => {
        const pending = state.pendingMessages.get(clientId);
        if (!pending) return;
        const convId = pending.conversationId;
        const messages = state.messagesByConversation[convId];
        if (!messages) return;
        const idx = messages.findIndex((m) => m.clientId === clientId);
        if (idx !== -1) {
          messages[idx] = serverMessage;
        }
        state.pendingMessages.delete(clientId);
      }),

    failMessage: (clientId) =>
      set((state) => {
        const pending = state.pendingMessages.get(clientId);
        if (!pending) return;
        const convId = pending.conversationId;
        const messages = state.messagesByConversation[convId];
        if (!messages) return;
        const msg = messages.find((m) => m.clientId === clientId);
        if (msg) msg.status = 'failed';
        state.pendingMessages.delete(clientId);
      }),

    updateMessageStatus: (messageId, status) =>
      set((state) => {
        for (const messages of Object.values(state.messagesByConversation)) {
          const msg = messages.find((m) => m.id === messageId);
          if (msg) {
            msg.status = status;
            break;
          }
        }
      }),

    recallMessage: (conversationId, messageId) =>
      set((state) => {
        const messages = state.messagesByConversation[conversationId];
        if (!messages) return;
        const msg = messages.find((m) => m.id === messageId);
        if (msg) {
          msg.type = 'recall' as any;
          msg.content = { action: 'recall', operatorId: msg.senderId };
        }
      }),

    setHasMore: (conversationId, hasMore) =>
      set((state) => {
        state.hasMore[conversationId] = hasMore;
      }),
  })),
);
```

### 2.2 会话 Store

```typescript
// stores/conversationStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Conversation } from '@/types/conversation';

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  typingUsers: Record<string, Set<string>>;  // conversationId -> Set<userId>
}

interface ConversationActions {
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  updateConversation: (id: string, partial: Partial<Conversation>) => void;
  incrementUnread: (id: string) => void;
  clearUnread: (id: string) => void;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
}

export const useConversationStore = create<ConversationState & ConversationActions>()(
  immer((set) => ({
    conversations: [],
    activeConversationId: null,
    typingUsers: {},

    setConversations: (conversations) =>
      set((state) => {
        state.conversations = conversations;
      }),

    setActiveConversation: (id) =>
      set((state) => {
        state.activeConversationId = id;
      }),

    updateConversation: (id, partial) =>
      set((state) => {
        const conv = state.conversations.find((c) => c.id === id);
        if (conv) Object.assign(conv, partial);
      }),

    incrementUnread: (id) =>
      set((state) => {
        const conv = state.conversations.find((c) => c.id === id);
        if (conv) conv.unreadCount += 1;
      }),

    clearUnread: (id) =>
      set((state) => {
        const conv = state.conversations.find((c) => c.id === id);
        if (conv) conv.unreadCount = 0;
      }),

    setTyping: (conversationId, userId, isTyping) =>
      set((state) => {
        if (!state.typingUsers[conversationId]) {
          state.typingUsers[conversationId] = new Set();
        }
        if (isTyping) {
          state.typingUsers[conversationId].add(userId);
        } else {
          state.typingUsers[conversationId].delete(userId);
        }
      }),
  })),
);
```

### 2.3 在线状态 Store

```typescript
// stores/presenceStore.ts
import { create } from 'zustand';

interface PresenceState {
  onlineUsers: Set<string>;
  lastSeen: Record<string, number>;
  setOnline: (userId: string) => void;
  setOffline: (userId: string, lastSeen: number) => void;
  isOnline: (userId: string) => boolean;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineUsers: new Set(),
  lastSeen: {},

  setOnline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      next.add(userId);
      return { onlineUsers: next };
    }),

  setOffline: (userId, lastSeenTs) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      next.delete(userId);
      return {
        onlineUsers: next,
        lastSeen: { ...state.lastSeen, [userId]: lastSeenTs },
      };
    }),

  isOnline: (userId) => get().onlineUsers.has(userId),
}));
```

---

## 3. 消息收发核心逻辑

### 3.1 消息同步 Hook（连接 Socket 事件与 Store）

```typescript
// hooks/useMessageSync.ts
import { useCallback } from 'react';
import { useSocketEvent } from './useSocketEvent';
import { useMessageStore } from '@/stores/messageStore';
import { useConversationStore } from '@/stores/conversationStore';
import { usePresenceStore } from '@/stores/presenceStore';

/**
 * 在 App 顶层挂载一次，负责将 Socket 事件同步到 Zustand Store
 */
export function useMessageSync() {
  const addMessage = useMessageStore((s) => s.addMessage);
  const updateMessageStatus = useMessageStore((s) => s.updateMessageStatus);
  const recallMessage = useMessageStore((s) => s.recallMessage);
  const { updateConversation, incrementUnread, activeConversationId, setTyping } =
    useConversationStore();
  const { setOnline, setOffline } = usePresenceStore();

  // 收到新消息
  useSocketEvent(
    'message:new',
    useCallback(
      (message) => {
        addMessage(message.conversationId, message);
        updateConversation(message.conversationId, { lastMessage: message });
        // 非当前活跃会话 -> 未读 +1
        if (message.conversationId !== activeConversationId) {
          incrementUnread(message.conversationId);
        }
      },
      [addMessage, updateConversation, incrementUnread, activeConversationId],
    ),
  );

  // 消息状态更新
  useSocketEvent(
    'message:status',
    useCallback(
      ({ messageId, status }) => {
        updateMessageStatus(messageId, status);
      },
      [updateMessageStatus],
    ),
  );

  // 消息撤回
  useSocketEvent(
    'message:recalled',
    useCallback(
      ({ messageId, conversationId }) => {
        recallMessage(conversationId, messageId);
      },
      [recallMessage],
    ),
  );

  // typing 状态
  useSocketEvent(
    'typing:update',
    useCallback(
      ({ conversationId, userId, isTyping }) => {
        setTyping(conversationId, userId, isTyping);
      },
      [setTyping],
    ),
  );

  // 在线状态
  useSocketEvent(
    'presence:update',
    useCallback(
      ({ userId, online, lastSeen }) => {
        if (online) {
          setOnline(userId);
        } else {
          setOffline(userId, lastSeen ?? Date.now());
        }
      },
      [setOnline, setOffline],
    ),
  );
}
```

### 3.2 消息发送 Hook（乐观更新）

```typescript
// hooks/useSendMessage.ts
import { useCallback } from 'react';
import { nanoid } from 'nanoid';
import { getSocket } from './useSocket';
import { useMessageStore } from '@/stores/messageStore';
import type { MessageType } from '@/types/message';

export function useSendMessage() {
  const { sendMessageOptimistic, confirmMessage, failMessage } = useMessageStore();

  const sendMessage = useCallback(
    (conversationId: string, type: MessageType, content: any) => {
      const socket = getSocket();
      if (!socket?.connected) return;

      const clientId = nanoid();
      const currentUserId = socket.auth?.userId; // 也可从 auth store 获取

      // 1. 乐观更新：立即渲染到消息列表
      const optimisticMessage = {
        id: clientId,         // 临时使用 clientId 作为 id
        clientId,
        conversationId,
        senderId: currentUserId,
        type,
        content,
        status: 'sending' as const,
        createdAt: Date.now(),
      };
      sendMessageOptimistic(conversationId, optimisticMessage);

      // 2. 通过 Socket.IO 发送（带 ACK 回调）
      socket.emit(
        'message:send',
        { conversationId, clientId, type, content },
        (response) => {
          if (response.success && response.messageId) {
            // 3a. 发送成功：用服务端消息替换临时消息
            confirmMessage(clientId, {
              ...optimisticMessage,
              id: response.messageId,
              status: 'sent',
            });
          } else {
            // 3b. 发送失败
            failMessage(clientId);
          }
        },
      );
    },
    [sendMessageOptimistic, confirmMessage, failMessage],
  );

  return { sendMessage };
}
```

### 3.3 历史消息加载（REST + 分页）

```typescript
// hooks/useMessageHistory.ts
import { useState, useCallback } from 'react';
import axios from '@/lib/axios';
import { useMessageStore } from '@/stores/messageStore';
import type { Message } from '@/types/message';

const PAGE_SIZE = 30;

export function useMessageHistory(conversationId: string) {
  const [loading, setLoading] = useState(false);
  const { prependMessages, setHasMore, messagesByConversation, hasMore } = useMessageStore();

  const messages = messagesByConversation[conversationId] ?? [];
  const canLoadMore = hasMore[conversationId] !== false;

  const loadMore = useCallback(async () => {
    if (loading || !canLoadMore) return;
    setLoading(true);

    try {
      const oldest = messages[0];
      const params: any = { limit: PAGE_SIZE };
      if (oldest) {
        params.before = oldest.createdAt;  // 游标分页
      }

      const { data } = await axios.get<Message[]>(
        `/api/conversations/${conversationId}/messages`,
        { params },
      );

      if (data.length < PAGE_SIZE) {
        setHasMore(conversationId, false);
      }
      if (data.length > 0) {
        prependMessages(conversationId, data);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, loading, canLoadMore, messages, prependMessages, setHasMore]);

  return { messages, loading, canLoadMore, loadMore };
}
```

---

## 4. UI 组件结构

### 4.1 组件树

```
<ChatApp>
+-- <ConversationList>               # 左侧会话列表
|   +-- <SearchBar />                # 搜索联系人/会话
|   +-- <ConversationItem />         # 单个会话条目
|       +-- <Avatar />               # 头像（含在线状态指示器）
|       +-- <LastMessage />          # 最新消息预览
|       +-- <UnreadBadge />          # 未读数角标
+-- <ChatPanel>                      # 右侧聊天面板
|   +-- <ChatHeader />              # 会话标题栏
|   |   +-- <ConversationTitle />
|   |   +-- <ActionButtons />        # 搜索、详情等
|   +-- <MessageList />              # 消息列表（虚拟滚动）
|   |   +-- <MessageBubble />        # 消息气泡
|   |   |   +-- <TextMessage />
|   |   |   +-- <ImageMessage />
|   |   |   +-- <FileMessage />
|   |   |   +-- <SystemMessage />
|   |   +-- <DateDivider />          # 日期分隔线
|   |   +-- <LoadMoreTrigger />      # 加载更多触发器
|   +-- <TypingIndicator />          # "对方正在输入..."
|   +-- <MessageInput />            # 输入区域
|       +-- <EmojiPicker />
|       +-- <FileUploadButton />
|       +-- <TextArea />
|       +-- <SendButton />
+-- <ChatDetail />                   # 会话详情面板（可选）
    +-- <MemberList />
    +-- <SharedFiles />
```

### 4.2 消息列表（虚拟滚动）

消息列表需要虚拟滚动来处理大量消息。推荐使用 **react-virtuoso**，它原生支持反向列表（底部对齐）和动态行高。

```typescript
// components/MessageList.tsx
import { useRef, useCallback } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useMessageHistory } from '@/hooks/useMessageHistory';
import { MessageBubble } from './MessageBubble';
import { DateDivider } from './DateDivider';

interface Props {
  conversationId: string;
}

export function MessageList({ conversationId }: Props) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { messages, loading, canLoadMore, loadMore } = useMessageHistory(conversationId);

  // 新消息到达时滚动到底部
  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      behavior: 'smooth',
      align: 'end',
    });
  }, [messages.length]);

  // 判断是否需要插入日期分隔线
  const shouldShowDate = (index: number) => {
    if (index === 0) return true;
    const curr = new Date(messages[index].createdAt).toDateString();
    const prev = new Date(messages[index - 1].createdAt).toDateString();
    return curr !== prev;
  };

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={messages}
      // 关键：反向列表，新消息在底部，向上滚动加载历史
      followOutput="smooth"          // 新消息到达时自动滚动
      alignToBottom                  // 初始对齐到底部
      initialTopMostItemIndex={messages.length - 1}
      // 向上滚动加载更多
      startReached={() => {
        if (canLoadMore && !loading) loadMore();
      }}
      // 渲染每条消息
      itemContent={(index, message) => (
        <div>
          {shouldShowDate(index) && (
            <DateDivider date={new Date(message.createdAt)} />
          )}
          <MessageBubble message={message} />
        </div>
      )}
      // 顶部加载指示器
      components={{
        Header: () =>
          loading ? <div className="loading-spinner">加载中...</div> : null,
      }}
    />
  );
}
```

### 4.3 消息气泡

```typescript
// components/MessageBubble.tsx
import type { Message } from '@/types/message';
import { useAuthStore } from '@/stores/authStore';
import { MessageStatus } from './MessageStatus';

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isMine = message.senderId === currentUserId;

  if (message.type === 'system') {
    return (
      <div className="system-message">
        {(message.content as any).action}
      </div>
    );
  }

  return (
    <div className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
      {!isMine && <Avatar userId={message.senderId} />}
      <div className={`bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'}`}>
        {message.type === 'text' && (
          <p className="message-text">{(message.content as any).text}</p>
        )}
        {message.type === 'image' && (
          <img
            src={(message.content as any).thumbnail || (message.content as any).url}
            alt="image"
            className="message-image"
            loading="lazy"
            onClick={() => openImagePreview((message.content as any).url)}
          />
        )}
        {message.type === 'file' && (
          <FileAttachment content={message.content as any} />
        )}
        <div className="message-meta">
          <time>{formatTime(message.createdAt)}</time>
          {isMine && <MessageStatus status={message.status} />}
        </div>
      </div>
    </div>
  );
}
```

### 4.4 输入区域

```typescript
// components/MessageInput.tsx
import { useState, useRef, useCallback } from 'react';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';

interface Props {
  conversationId: string;
}

export function MessageInput({ conversationId }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage } = useSendMessage();
  const { startTyping, stopTyping } = useTypingIndicator(conversationId);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    sendMessage(conversationId, 'text', { text: trimmed });
    setText('');
    stopTyping();
    textareaRef.current?.focus();
  }, [text, conversationId, sendMessage, stopTyping]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    startTyping();
  };

  return (
    <div className="message-input">
      <div className="input-toolbar">
        <EmojiPickerButton onSelect={(emoji) => setText((t) => t + emoji)} />
        <FileUploadButton conversationId={conversationId} />
      </div>
      <div className="input-area">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          rows={1}
        />
        <button
          className="send-button"
          onClick={handleSend}
          disabled={!text.trim()}
        >
          发送
        </button>
      </div>
    </div>
  );
}
```

---

## 5. 实时交互特性

### 5.1 Typing Indicator（输入状态指示）

```typescript
// hooks/useTypingIndicator.ts
import { useRef, useCallback } from 'react';
import { getSocket } from './useSocket';

const TYPING_TIMEOUT = 3000; // 3 秒无输入视为停止

export function useTypingIndicator(conversationId: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const isTypingRef = useRef(false);

  const startTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket) return;

    // 首次输入或已超时后重新发送
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('typing:start', { conversationId });
    }

    // 重置超时计时器
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit('typing:stop', { conversationId });
    }, TYPING_TIMEOUT);
  }, [conversationId]);

  const stopTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket || !isTypingRef.current) return;

    clearTimeout(timerRef.current);
    isTypingRef.current = false;
    socket.emit('typing:stop', { conversationId });
  }, [conversationId]);

  return { startTyping, stopTyping };
}
```

```typescript
// components/TypingIndicator.tsx
import { useConversationStore } from '@/stores/conversationStore';

interface Props {
  conversationId: string;
}

export function TypingIndicator({ conversationId }: Props) {
  const typingUsers = useConversationStore(
    (s) => s.typingUsers[conversationId],
  );

  if (!typingUsers || typingUsers.size === 0) return null;

  const names = Array.from(typingUsers); // 实际应映射为用户名
  const text =
    names.length === 1
      ? `${names[0]} 正在输入...`
      : `${names.length} 人正在输入...`;

  return (
    <div className="typing-indicator">
      <span className="typing-dots">
        <span /><span /><span />
      </span>
      {text}
    </div>
  );
}
```

### 5.2 已读回执

```typescript
// hooks/useReadReceipt.ts
import { useEffect, useRef } from 'react';
import { getSocket } from './useSocket';
import { useConversationStore } from '@/stores/conversationStore';

/**
 * 自动发送已读回执：
 * - 当用户查看当前会话的最新消息时触发
 * - 使用 IntersectionObserver 检测消息是否进入视口
 */
export function useReadReceipt(conversationId: string, lastMessageId: string | undefined) {
  const clearUnread = useConversationStore((s) => s.clearUnread);
  const sentRef = useRef<string>(); // 防重复发送

  useEffect(() => {
    if (!lastMessageId || sentRef.current === lastMessageId) return;

    const socket = getSocket();
    if (!socket) return;

    // 发送已读回执
    socket.emit('message:read', {
      conversationId,
      messageId: lastMessageId,
    });
    clearUnread(conversationId);
    sentRef.current = lastMessageId;
  }, [conversationId, lastMessageId, clearUnread]);
}
```

### 5.3 在线状态心跳

```typescript
// hooks/useHeartbeat.ts
import { useEffect } from 'react';
import { getSocket } from './useSocket';

const HEARTBEAT_INTERVAL = 30_000; // 30 秒

/**
 * 客户端心跳 -- Socket.IO 内置 ping/pong 已处理连接检测，
 * 此处是应用层心跳，用于更精准的在线状态判断。
 */
export function useHeartbeat() {
  useEffect(() => {
    const interval = setInterval(() => {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('heartbeat' as any);
      }
    }, HEARTBEAT_INTERVAL);

    return () => clearInterval(interval);
  }, []);
}
```

---

## 6. 文件上传

```typescript
// hooks/useFileUpload.ts
import { useState, useCallback } from 'react';
import axios from '@/lib/axios';
import { useSendMessage } from './useSendMessage';
import type { MessageType } from '@/types/message';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function useFileUpload(conversationId: string) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { sendMessage } = useSendMessage();

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error('文件大小超过 50MB 限制');
      }

      setUploading(true);
      setProgress(0);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const { data } = await axios.post('/api/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
          },
        });

        const isImage = IMAGE_TYPES.includes(file.type);
        const type: MessageType = isImage ? 'image' : 'file';

        sendMessage(conversationId, type, {
          url: data.url,
          thumbnail: data.thumbnail,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          ...(data.width && { width: data.width, height: data.height }),
        });
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [conversationId, sendMessage],
  );

  return { upload, uploading, progress };
}
```

---

## 7. 离线支持与重连同步

### 7.1 重连同步逻辑

```typescript
// hooks/useReconnectSync.ts
import { useEffect, useRef } from 'react';
import { getSocket } from './useSocket';
import axios from '@/lib/axios';
import { useMessageStore } from '@/stores/messageStore';
import { useConversationStore } from '@/stores/conversationStore';

export function useReconnectSync() {
  const lastSyncTimestamp = useRef(Date.now());
  const addMessage = useMessageStore((s) => s.addMessage);
  const setConversations = useConversationStore((s) => s.setConversations);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleReconnect = async () => {
      // Socket.IO 连接状态恢复成功时不需要额外同步
      if (socket.recovered) {
        lastSyncTimestamp.current = Date.now();
        return;
      }

      // 恢复失败 -> 通过 REST 拉取缺失数据
      try {
        const since = lastSyncTimestamp.current;

        // 并行拉取会话列表和未读消息
        const [convRes, msgRes] = await Promise.all([
          axios.get('/api/conversations'),
          axios.get('/api/messages/sync', { params: { since } }),
        ]);

        setConversations(convRes.data);
        for (const msg of msgRes.data) {
          addMessage(msg.conversationId, msg);
        }
      } catch (error) {
        console.error('Reconnect sync failed:', error);
      }

      lastSyncTimestamp.current = Date.now();
    };

    socket.on('connect', handleReconnect);
    return () => { socket.off('connect', handleReconnect); };
  }, [addMessage, setConversations]);
}
```

### 7.2 消息重发

```typescript
// hooks/useRetryMessage.ts
import { useCallback } from 'react';
import { getSocket } from './useSocket';
import { useMessageStore } from '@/stores/messageStore';

export function useRetryMessage() {
  const { confirmMessage, failMessage, messagesByConversation } = useMessageStore();

  const retry = useCallback(
    (conversationId: string, clientId: string) => {
      const socket = getSocket();
      if (!socket?.connected) return;

      const messages = messagesByConversation[conversationId];
      const msg = messages?.find((m) => m.clientId === clientId);
      if (!msg || msg.status !== 'failed') return;

      // 更新状态为发送中
      msg.status = 'sending';

      socket.emit(
        'message:send',
        {
          conversationId,
          clientId,
          type: msg.type,
          content: msg.content,
        },
        (response) => {
          if (response.success && response.messageId) {
            confirmMessage(clientId, { ...msg, id: response.messageId, status: 'sent' });
          } else {
            failMessage(clientId);
          }
        },
      );
    },
    [messagesByConversation, confirmMessage, failMessage],
  );

  return { retry };
}
```

---

## 8. REST API 封装（Axios）

### 8.1 Axios 实例配置

```typescript
// lib/axios.ts
import axios from 'axios';

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 15000,
});

// 请求拦截：附加 JWT
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：处理 401
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default instance;
```

### 8.2 核心 API 接口

```typescript
// api/chat.ts
import axios from '@/lib/axios';
import type { Conversation } from '@/types/conversation';
import type { Message } from '@/types/message';

/** 获取会话列表 */
export const getConversations = () =>
  axios.get<Conversation[]>('/api/conversations');

/** 获取历史消息（游标分页） */
export const getMessages = (conversationId: string, params: { before?: number; limit?: number }) =>
  axios.get<Message[]>(`/api/conversations/${conversationId}/messages`, { params });

/** 创建会话 */
export const createConversation = (data: { type: 'direct' | 'group'; memberIds: string[]; name?: string }) =>
  axios.post<Conversation>('/api/conversations', data);

/** 上传文件 */
export const uploadFile = (file: File, onProgress?: (percent: number) => void) => {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post<{ url: string; thumbnail?: string; width?: number; height?: number }>(
    '/api/upload',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    },
  );
};

/** 同步缺失消息（重连后使用） */
export const syncMessages = (since: number) =>
  axios.get<Message[]>('/api/messages/sync', { params: { since } });
```

---

## 9. 客户端安全

### 9.1 WebSocket 认证（客户端侧）

```typescript
// 通过 auth 选项传递 JWT（非 query string，避免日志泄露）
const socket = io(WS_URL, {
  auth: { token: jwt },           // 安全：在 WebSocket 握手 payload 中
  // query: { token: jwt },       // 不推荐：会出现在 URL 和日志中
});
```

### 9.2 Token 刷新

```typescript
// 客户端监听 token 过期事件，刷新后重连
socket.on('connect_error', async (error) => {
  if (error.message === 'TOKEN_EXPIRED') {
    try {
      const { data } = await axios.post('/api/auth/refresh');
      socket.auth = { token: data.accessToken };
      socket.connect(); // 使用新 token 重连
    } catch {
      // 刷新失败 -> 跳转登录页
      window.location.href = '/login';
    }
  }
});
```

### 9.3 XSS 防护（React 渲染层）

```typescript
// 消息渲染时必须转义 HTML -- React JSX 默认转义，但需注意：

// 安全：React 自动转义
<p>{message.content.text}</p>

// 危险：dangerouslySetInnerHTML 绕过转义
<div dangerouslySetInnerHTML={{ __html: message.content.text }} />

// 如果需要支持富文本（Markdown），使用白名单清理库：
import DOMPurify from 'dompurify';
import { marked } from 'marked';

function renderMarkdown(text: string) {
  const html = marked(text);
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'code', 'pre', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

// 使用清理后的 HTML
<div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
```

---

## 10. 项目文件结构（推荐）

```
src/
+-- api/
|   +-- chat.ts                    # REST API 接口封装
+-- components/
|   +-- chat/
|       +-- ChatApp.tsx            # 顶层容器
|       +-- ConversationList.tsx   # 会话列表
|       +-- ConversationItem.tsx   # 会话条目
|       +-- ChatPanel.tsx          # 聊天面板
|       +-- ChatHeader.tsx         # 聊天头部
|       +-- MessageList.tsx        # 消息列表（虚拟滚动）
|       +-- MessageBubble.tsx      # 消息气泡
|       +-- MessageInput.tsx       # 输入区域
|       +-- TypingIndicator.tsx    # 输入状态指示
|       +-- EmojiPicker.tsx        # 表情选择器
|       +-- FileUpload.tsx         # 文件上传
|       +-- DateDivider.tsx        # 日期分隔线
|       +-- MessageStatus.tsx      # 消息状态图标
|       +-- UnreadBadge.tsx        # 未读角标
+-- hooks/
|   +-- useSocket.ts               # Socket 连接管理
|   +-- useSocketEvent.ts          # Socket 事件监听
|   +-- useMessageSync.ts          # 消息同步（Socket -> Store）
|   +-- useSendMessage.ts          # 消息发送（乐观更新）
|   +-- useMessageHistory.ts       # 历史消息加载
|   +-- useTypingIndicator.ts      # 输入状态
|   +-- useReadReceipt.ts          # 已读回执
|   +-- useFileUpload.ts           # 文件上传
|   +-- useReconnectSync.ts        # 重连同步
|   +-- useRetryMessage.ts         # 消息重发
|   +-- useHeartbeat.ts            # 应用层心跳
+-- stores/
|   +-- messageStore.ts            # 消息状态
|   +-- conversationStore.ts       # 会话状态
|   +-- presenceStore.ts           # 在线状态
|   +-- authStore.ts               # 认证状态
+-- types/                         # 类型定义（引用 im-protocol-core 协议）
|   +-- message.ts
|   +-- conversation.ts
|   +-- socket-events.ts
+-- lib/
    +-- axios.ts                   # Axios 实例配置
```

---

## 11. 关键依赖

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "socket.io-client": "^4.7.0",
    "zustand": "^4.5.0",
    "immer": "^10.0.0",
    "axios": "^1.7.0",
    "react-virtuoso": "^4.7.0",
    "nanoid": "^5.0.0",
    "dompurify": "^3.1.0",
    "emoji-picker-react": "^4.9.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/dompurify": "^3.0.0"
  }
}
```

---

## 12. 常见陷阱与最佳实践

| 陷阱 | 正确做法 |
|------|---------|
| 在 useEffect 中直接操作 socket 但忘记清理 | 始终在 cleanup 中 `socket.off(event)` |
| 消息列表不去重导致重连后重复显示 | 用 `message.id` 或 `clientId` 做唯一性校验 |
| 直接用 `JSON.stringify` 序列化 `Set`/`Map` | Zustand 的 `immer` 中间件对 Set/Map 支持有限，考虑用 Record 替代 |
| 在 Socket 事件回调中引用过期的 state | 用 `zustand` 的 `getState()` 而非闭包中的 state |
| 大量消息不做虚拟滚动导致 DOM 爆炸 | 使用 react-virtuoso 或 @tanstack/virtual |
| typing 事件发送过于频繁 | 加 debounce/throttle，3 秒超时自动停止 |
| 不处理 Socket.IO 的 `io server disconnect` | 此原因表示服务端主动断开，需要走重新认证流程 |
| 文件上传完才发消息，用户等待时间长 | 上传开始时就展示进度 UI，上传完成后自动发送消息 |
