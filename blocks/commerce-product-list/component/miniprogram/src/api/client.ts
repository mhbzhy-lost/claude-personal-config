import Taro from '@tarojs/taro';
import type {
  Auth,
  BlockConfig,
  ProductFilters,
  ProductWithState,
  User,
  UserProductState,
} from '../types';

interface Page<T> {
  items: T[];
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

  listProducts(params: ProductFilters & { page?: number; page_size?: number }): Promise<Page<ProductWithState>> {
    const q = new URLSearchParams();
    if (params.q) q.set('q', params.q);
    if (params.category) q.set('category', params.category);
    if (params.price_min !== undefined) q.set('price_min', String(params.price_min));
    if (params.price_max !== undefined) q.set('price_max', String(params.price_max));
    if (params.in_stock_only) q.set('in_stock_only', 'true');
    if (params.sort) q.set('sort', params.sort);
    if (params.page) q.set('page', String(params.page));
    if (params.page_size) q.set('page_size', String(params.page_size));
    return this.req(`/products?${q.toString()}`);
  }

  getProduct(id: string): Promise<ProductWithState> {
    return this.req(`/products/${id}`);
  }

  setFavorite(id: string, isFavorite: boolean): Promise<UserProductState> {
    return this.req(`/products/${id}/favorite`, {
      method: 'PUT',
      json: { is_favorite: isFavorite },
    });
  }

  setCartCount(id: string, count: number): Promise<UserProductState> {
    return this.req(`/products/${id}/cart`, {
      method: 'PUT',
      json: { count },
    });
  }

  getMe(): Promise<User> {
    return this.req(`/me`);
  }
}
