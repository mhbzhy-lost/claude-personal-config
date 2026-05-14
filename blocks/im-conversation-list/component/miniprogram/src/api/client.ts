import Taro from '@tarojs/taro';
import type { Auth, BlockConfig, Conversation, Message, User } from '../types';

interface Page<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}

async function authHeaders(auth: Auth): Promise<Record<string, string>> {
  if (auth.type === 'header') {
    return { [auth.headerName]: await auth.getValue() };
  }
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

  private async req<T>(
    path: string,
    init: { method?: string; json?: unknown; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(await authHeaders(this.cfg.auth)),
      ...(init.headers ?? {}),
    };
    if (init.json !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await Taro.request({
      url: `${this.base}${path}`,
      method: (init.method ?? 'GET') as 'GET' | 'POST' | 'PATCH' | 'DELETE',
      header: headers,
      data: init.json ?? undefined,
    });
    return handle<T>(res);
  }

  listConversations(params: {
    cursor?: string | null;
    limit?: number;
    filter?: 'all' | 'unread' | 'pinned' | 'muted';
  } = {}): Promise<Page<Conversation>> {
    const q = new URLSearchParams();
    if (params.cursor) q.set('cursor', params.cursor);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.filter) q.set('filter', params.filter);
    return this.req(`/conversations?${q.toString()}`);
  }

  searchConversations(query: string): Promise<Page<Conversation>> {
    return this.req(`/conversations/search?q=${encodeURIComponent(query)}&limit=50`);
  }

  getConversation(id: string): Promise<Conversation> {
    return this.req(`/conversations/${id}`);
  }

  patchConversation(
    id: string,
    body: { is_pinned?: boolean; is_muted?: boolean }
  ): Promise<Conversation> {
    return this.req(`/conversations/${id}`, { method: 'PATCH', json: body });
  }

  deleteConversation(id: string): Promise<void> {
    return this.req(`/conversations/${id}`, { method: 'DELETE' });
  }

  markRead(id: string, upToMessageId: string): Promise<void> {
    return this.req(`/conversations/${id}/read`, {
      method: 'POST',
      json: { up_to_message_id: upToMessageId },
    });
  }

  getMe(): Promise<User> {
    return this.req('/me');
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
