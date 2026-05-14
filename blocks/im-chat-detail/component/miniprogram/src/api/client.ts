import Taro from '@tarojs/taro';
import type {
  Auth, BlockConfig, Content, Message, Peer, Ulid, User,
} from '../types';

interface MessagePage {
  items: Message[];
  next_cursor: string | null;
  has_more: boolean;
}

async function authHeaders(auth: Auth | undefined): Promise<Record<string, string>> {
  if (!auth) return {};
  if (auth.type === 'header') return { [auth.headerName]: await auth.getValue() };
  return { Authorization: `Bearer ${await auth.getToken()}` };
}

async function handle<T>(res: Taro.request.SuccessCallbackResult): Promise<T> {
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const body = (res.data ?? {}) as Record<string, unknown>;
    const err = new Error((body.title as string) ?? `HTTP ${res.statusCode}`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.statusCode;
    err.code = body.code as string | undefined;
    throw err;
  }
  if (res.statusCode === 204) return undefined as T;
  return res.data as T;
}

export class BlockClient {
  constructor(private readonly cfg: BlockConfig) {}

  private get base(): string {
    return this.cfg.apiBaseUrl.replace(/\/$/, '') + '/v1';
  }

  protected async req<T>(path: string, init: { method?: string; json?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(await authHeaders(this.cfg.auth)),
      ...(init.headers ?? {}),
    };
    if (init.json !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await Taro.request({
      url: `${this.base}${path}`,
      method: (init.method ?? 'GET') as 'GET' | 'POST' | 'DELETE' | 'PATCH',
      header: headers,
      data: init.json ?? undefined,
    });
    return handle<T>(res);
  }

  getMe(): Promise<User> {
    return this.req<User>('/me');
  }

  getPeer(peerId: Ulid): Promise<Peer> {
    return this.req<Peer>(`/peers/${peerId}`);
  }

  listMessagesWith(peerId: Ulid, params: { cursor?: string | null; limit?: number } = {}): Promise<MessagePage> {
    const q = new URLSearchParams();
    if (params.cursor) q.set('cursor', params.cursor);
    if (params.limit) q.set('limit', String(params.limit));
    return this.req<MessagePage>(`/messages/with/${peerId}?${q.toString()}`);
  }

  sendMessage(recipientId: Ulid, content: Content, clientId?: string): Promise<Message> {
    return this.req<Message>('/messages', {
      method: 'POST',
      json: { recipient_id: recipientId, content, client_id: clientId },
    });
  }

  markRead(peerId: Ulid, upToMessageId: Ulid): Promise<void> {
    return this.req<void>(`/messages/with/${peerId}/read`, {
      method: 'POST',
      json: { up_to_message_id: upToMessageId },
    });
  }

  recallMessage(messageId: Ulid): Promise<Message> {
    return this.req<Message>(`/messages/${messageId}/recall`, { method: 'POST' });
  }

  async wsUrl(): Promise<string> {
    const httpBase = this.cfg.apiBaseUrl.replace(/\/$/, '');
    const wsBase = httpBase.replace(/^http/i, 'ws');
    if (this.cfg.auth.type === 'header') {
      const value = await this.cfg.auth.getValue();
      return `${wsBase}/v1/ws?dev_user_id=${encodeURIComponent(value)}`;
    }
    const token = await this.cfg.auth.getToken();
    return `${wsBase}/v1/ws?token=${encodeURIComponent(token)}`;
  }
}
