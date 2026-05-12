import type { Auth, BlockConfig, OrderDetail, OrderStatus, OrderSummary, User } from '../types';

interface OrderPage {
  items: OrderSummary[];
  total: number;
  page: number;
  page_size: number;
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

  listOrders(params: { status?: OrderStatus; page?: number; page_size?: number } = {}): Promise<OrderPage> {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.page) q.set('page', String(params.page));
    if (params.page_size) q.set('page_size', String(params.page_size));
    return this.req<OrderPage>(`/orders?${q.toString()}`);
  }

  getOrder(id: Ulid): Promise<OrderDetail> {
    return this.req<OrderDetail>(`/orders/${id}`);
  }

  cancelOrder(id: Ulid, reason?: string): Promise<OrderDetail> {
    return this.req<OrderDetail>(`/orders/${id}/cancel`, {
      method: 'POST',
      json: { reason },
    });
  }

  requestRefund(id: Ulid, reason: string): Promise<OrderDetail> {
    return this.req<OrderDetail>(`/orders/${id}/refund`, {
      method: 'POST',
      json: { reason },
    });
  }
}

type Ulid = string;
