// Public types for @cl/im-conversation-list-mp.
// Aligned with web version (same interfaces, same field names).

export type Ulid = string;

export interface User {
  id: Ulid;
  name: string;
  avatar_url?: string | null;
  online_status?: 'online' | 'offline' | 'away' | null;
}

export type Content =
  | { kind: 'text'; text: string }
  | {
      kind: 'image';
      url: string;
      width?: number | null;
      height?: number | null;
      alt?: string | null;
    }
  | { kind: 'file'; url: string; name: string; size: number; mime: string }
  | { kind: 'system'; code: string; params?: Record<string, unknown> }
  | { kind: 'recall'; recall_of: Ulid };

export interface Message {
  id: Ulid;
  conversation_id: Ulid;
  sender: User;
  content: Content;
  client_id?: string | null;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  sent_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
}

export interface Conversation {
  id: Ulid;
  type: 'direct' | 'group';
  title?: string | null;
  avatar_url?: string | null;
  participants: User[];
  participant_count: number;
  last_message?: Message | null;
  unread_count: number;
  is_pinned: boolean;
  is_muted: boolean;
  pinned_at?: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export type WsEvent =
  | {
      type: 'message.new';
      event_version: number;
      ts: string;
      seq: number;
      message: Message;
      conversation_summary: { id: Ulid; unread_count: number; last_activity_at: string };
    }
  | { type: 'message.updated'; event_version: number; ts: string; seq: number; message: Message }
  | {
      type: 'message.read';
      event_version: number;
      ts: string;
      seq: number;
      conversation_id: Ulid;
      reader_id: Ulid;
      up_to_message_id: Ulid;
    }
  | {
      type: 'conversation.created';
      event_version: number;
      ts: string;
      seq: number;
      conversation: Conversation;
    }
  | {
      type: 'conversation.updated';
      event_version: number;
      ts: string;
      seq: number;
      conversation: Conversation;
      changed_fields: string[];
    }
  | {
      type: 'conversation.deleted';
      event_version: number;
      ts: string;
      seq: number;
      conversation_id: Ulid;
    }
  | {
      type: 'presence.changed';
      event_version: number;
      ts: string;
      seq: number;
      user_id: Ulid;
      online_status: 'online' | 'offline' | 'away';
    };

export interface AuthHeader {
  type: 'header';
  headerName: string;
  getValue: () => string | Promise<string>;
}

export interface AuthBearer {
  type: 'bearer';
  getToken: () => string | Promise<string>;
}

export type Auth = AuthHeader | AuthBearer;

export interface BlockConfig {
  apiBaseUrl: string;
  auth: Auth;
  pageSize?: number;
  locale?: {
    empty?: string;
    emptySearch?: string;
    loadMore?: string;
    error?: string;
    retry?: string;
  };
}

export interface UseConversationsResult {
  items: Conversation[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setSearch: (q: string) => void;
  search: string;
  pin: (id: Ulid, value: boolean) => Promise<void>;
  mute: (id: Ulid, value: boolean) => Promise<void>;
  remove: (id: Ulid) => Promise<void>;
  markRead: (id: Ulid, upToMessageId: Ulid) => Promise<void>;
  me: User | null;
  wsConnected: boolean;
}
