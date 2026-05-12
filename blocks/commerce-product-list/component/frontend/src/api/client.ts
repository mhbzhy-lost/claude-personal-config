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

  private async req<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
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
