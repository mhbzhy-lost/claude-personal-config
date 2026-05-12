// Public types for @ct/comment-thread.

export type Ulid = string;

export interface User {
  id: Ulid;
  name: string;
  avatar_url?: string | null;
}

export interface Comment {
  id: Ulid;
  resource_type: string;
  resource_id: Ulid;
  parent_comment_id?: Ulid | null;
  author: User;
  content: string;
  depth: number;
  reply_count: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthHeader {
  type: 'header';
  headerName: string;
  getValue: () => string | Promise<string>;
}

export interface AuthBearer {
  type: 'bearer';
  getToken: () => string | Promise<string>;
}

export type Auth = AuthHeader | AuthBearer;

export interface BlockConfig {
  /** Backend base URL, e.g. "http://localhost:8083". Component appends `/v1`. */
  apiBaseUrl: string;
  /** Auth provider — optional. Anonymous can browse; auth required to post. */
  auth?: Auth;
}
