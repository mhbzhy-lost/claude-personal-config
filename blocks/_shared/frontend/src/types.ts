// Public types for @{{PKG_NS}}/{{SLUG}}.
// Mirrors ../../protocol/openapi.yaml. Extend as your domain grows.

export type Ulid = string;

export interface User {
  id: Ulid;
  name: string;
  avatar_url?: string | null;
}

// ---- Auth provider abstraction (do not modify; identical across blocks) ----

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

// ---- Config ----

export interface BlockConfig {
  /** Backend base URL, e.g. "http://localhost:{{BACKEND_PORT}}". Component appends `/v1`. */
  apiBaseUrl: string;
  /** Auth provider — optional for blocks that allow anonymous access. */
  auth?: Auth;
}
