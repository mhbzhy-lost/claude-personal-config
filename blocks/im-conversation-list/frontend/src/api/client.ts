import type { Conversation, ImclAuth, ImclConfig, Message, User } from '../types';

interface Page<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}

async function authHeaders(auth: ImclAuth): Promise<Record<string, string>> {
  if (auth.type === 'header') {
    return { [auth.headerName]: await auth.getValue() };
  }
  return { Authorization: `Bearer ${await auth.getToken()}` };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = new Error((body.title as string) ?? `HTTP ${res.status}`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = body.code as string | undefined;
    throw err;
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export class ImclClient {
  constructor(private readonly cfg: ImclConfig) {}

  private get base(): string {
    return this.cfg.apiBaseUrl.replace(/\/$/, '') + '/v1';
  }

  private async req<T>(
    path: string,
    init: RequestInit & { json?: unknown } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(await authHeaders(this.cfg.auth)),
      ...((init.headers as Record<string, string>) ?? {}),
    };
    const body =
      init.json !== undefined
        ? ((headers['Content-Type'] = 'application/json'), JSON.stringify(init.json))
        : init.body;
    return handle<T>(await fetch(`${this.base}${path}`, { ...init, headers, body }));
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

  sendMessage(
    id: string,
    body: { content: Message['content']; client_id?: string },
    idempotencyKey?: string
  ): Promise<Message> {
    return this.req(`/conversations/${id}/messages`, {
      method: 'POST',
      json: body,
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    });
  }

  getMe(): Promise<User> {
    return this.req(`/me`);
  }

  /** Build a WebSocket URL with auth applied. */
  async wsUrl(): Promise<string> {
    const httpBase = this.cfg.apiBaseUrl.replace(/\/$/, '');
    const wsBase = httpBase.replace(/^http/i, 'ws');
    if (this.cfg.auth.type === 'header') {
      // Browsers can't set custom headers on WS; fall back to query param
      // (backend dev-mode WS endpoint accepts dev_user_id).
      const value = await this.cfg.auth.getValue();
      return `${wsBase}/v1/ws?dev_user_id=${encodeURIComponent(value)}`;
    }
    const token = await this.cfg.auth.getToken();
    return `${wsBase}/v1/ws?token=${encodeURIComponent(token)}`;
  }
}
