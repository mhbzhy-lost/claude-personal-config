// Public types for @imcl/conversation-list.
// These mirror blocks/im-conversation-list/protocol/openapi.yaml; when the
// protocol changes, regenerate via `make -C ../protocol gen` and reconcile.
// Single source of truth for downstream consumers.

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
  /** "header" auth: send a custom header with each request. */
  type: 'header';
  headerName: string;
  getValue: () => string | Promise<string>;
}

export interface AuthBearer {
  /** "bearer" auth: standard Authorization: Bearer <token>. */
  type: 'bearer';
  getToken: () => string | Promise<string>;
}

export type Auth = AuthHeader | AuthBearer;

export interface BlockConfig {
  /** Backend base URL, e.g. "http://localhost:8080". The component appends `/v1`. */
  apiBaseUrl: string;
  /** Auth provider — see Auth variants. */
  auth: Auth;
  /** Page size for cursor pagination. Default 20. */
  pageSize?: number;
  /** Locale strings (subset). Optional. */
  locale?: {
    empty?: string;
    emptySearch?: string;
    loadMore?: string;
    error?: string;
    retry?: string;
  };
}

export interface UseConversationsResult {
  /** Current ordered list of conversations (server-controlled order). */
  items: Conversation[];
  /** True when the initial fetch is in progress. */
  loading: boolean;
  /** Most recent fetch error, if any. */
  error: Error | null;
  /** Whether more pages are available. */
  hasMore: boolean;
  /** Trigger fetching the next page (no-op if !hasMore or loading). */
  loadMore: () => Promise<void>;
  /** Re-fetch from page 1 (used after reconnect or seq-gap detection). */
  refresh: () => Promise<void>;
  /** Search by query against title + last_message text. Empty string clears. */
  setSearch: (q: string) => void;
  /** Current search query (controlled via setSearch). */
  search: string;
  /** Toggle pinned for a conversation. */
  pin: (id: Ulid, value: boolean) => Promise<void>;
  /** Toggle muted for a conversation. */
  mute: (id: Ulid, value: boolean) => Promise<void>;
  /** Soft-delete a conversation from this user's list. */
  remove: (id: Ulid) => Promise<void>;
  /** Mark all messages in a conversation read up to a message id. */
  markRead: (id: Ulid, upToMessageId: Ulid) => Promise<void>;
  /** Identity of the current authenticated user. Null until /me resolves. */
  me: User | null;
  /** WebSocket connection state. */
  wsConnected: boolean;
}
