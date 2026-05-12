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
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class BlockClient {
  constructor(private readonly cfg: BlockConfig) {}

  private get base(): string {
    return this.cfg.apiBaseUrl.replace(/\/$/, '') + '/v1';
  }

  protected async req<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
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
