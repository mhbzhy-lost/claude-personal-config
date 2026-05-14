import Taro from '@tarojs/taro';
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

async function handle<T>(res: Taro.request.SuccessCallbackResult<T & { title?: string; code?: string }>): Promise<T> {
  const data = res.data;
  if (res.statusCode >= 400 || (data && typeof data === 'object' && 'title' in data)) {
    const err = new Error((data as Record<string, unknown>).title as string ?? `HTTP ${res.statusCode}`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.statusCode;
    err.code = (data as Record<string, unknown>).code as string | undefined;
    throw err;
  }
  return data as T;
}

export class BlockClient {
  constructor(private readonly cfg: BlockConfig) {}

  private get base(): string {
    return this.cfg.apiBaseUrl.replace(/\/$/, '') + '/v1';
  }

  private async req<T>(path: string, options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    json?: unknown;
    headers?: Record<string, string>;
  } = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(await authHeaders(this.cfg.auth)),
      ...(options.headers ?? {}),
    };
    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    return handle<T>(
      await Taro.request({
        url: `${this.base}${path}`,
        method: options.method ?? 'GET',
        header: headers,
        data: options.json,
      })
    );
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
