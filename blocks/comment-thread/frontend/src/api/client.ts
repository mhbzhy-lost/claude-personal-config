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
