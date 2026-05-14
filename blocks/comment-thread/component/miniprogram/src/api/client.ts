import Taro from '@tarojs/taro';
import type { Auth, BlockConfig, Comment, Ulid, User } from '../types';

interface CommentList {
  items: Comment[];
  total: number;
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
      method: (init.method ?? 'GET') as 'GET' | 'POST' | 'DELETE',
      header: headers,
      data: init.json ?? undefined,
    });
    return handle<T>(res);
  }

  getMe(): Promise<User> {
    return this.req<User>('/me');
  }

  listComments(resourceType: string, resourceId: Ulid): Promise<CommentList> {
    const q = new URLSearchParams({ resource_type: resourceType, resource_id: resourceId });
    return this.req<CommentList>(`/comments?${q.toString()}`);
  }

  createComment(input: {
    resource_type: string;
    resource_id: Ulid;
    parent_comment_id?: Ulid | null;
    content: string;
  }): Promise<Comment> {
    return this.req<Comment>('/comments', { method: 'POST', json: input });
  }

  deleteComment(id: Ulid): Promise<void> {
    return this.req<void>(`/comments/${id}`, { method: 'DELETE' });
  }
}
