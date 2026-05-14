import Taro from '@tarojs/taro';
import type { Auth, BlockConfig, ProductDetailData } from '../types';

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
  return (await res.data) as T;
}

export class BlockClient {
  constructor(private readonly cfg: BlockConfig) {}

  private get base(): string {
    return this.cfg.apiBaseUrl.replace(/\/$/, '') + '/v1';
  }

  protected async req<T>(path: string, init: { method?: string; headers?: Record<string, string> } = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(await authHeaders(this.cfg.auth)),
      ...(init.headers ?? {}),
    };
    const res = await Taro.request({
      url: `${this.base}${path}`,
      method: (init.method ?? 'GET') as 'GET',
      header: headers,
    });
    return handle<T>(res);
  }

  getProduct(productId: string): Promise<ProductDetailData> {
    return this.req<ProductDetailData>(`/products/${productId}`);
  }
}
