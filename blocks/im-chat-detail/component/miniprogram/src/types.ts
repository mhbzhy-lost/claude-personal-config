// Public types for @chat/im-chat-detail-mp.
// Aligned with web version (same interfaces, same field names).

export type Ulid = string;

export interface User {
  id: Ulid;
  name: string;
  avatar_url?: string | null;
}

export interface Peer {
  id: Ulid;
  name: string;
  avatar_url?: string | null;
  bio?: string | null;
  online_status?: 'online' | 'offline' | 'away' | null;
  last_seen_at?: string | null;
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
  | { kind: 'recall' };

export interface Message {
  id: Ulid;
  sender_id: Ulid;
  recipient_id: Ulid;
  content: Content;
  client_id?: string | null;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  sent_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
}

export type WsEvent =
  | { type: 'message.new'; event_version: number; ts: string; seq: number; message: Message }
  | { type: 'message.updated'; event_version: number; ts: string; seq: number; message: Message }
  | {
      type: 'message.read';
      event_version: number;
      ts: string;
      seq: number;
      reader_id: Ulid;
      up_to_message_id: Ulid;
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
}
