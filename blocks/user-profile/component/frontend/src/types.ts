import type { ReactNode } from 'react';

export type Ulid = string;

export interface ProfileStats {
  posts?: number;
  followers?: number;
  following?: number;
  /** Host can attach more numeric stats (likes / streak / etc). */
  [key: string]: number | undefined;
}

export interface UserProfileData {
  id: Ulid;
  name: string;
  handle?: string;
  avatar?: string;
  /** Optional banner / cover image (rendered behind avatar). */
  cover?: string;
  bio?: ReactNode;
  location?: string;
  website?: string;
  joined_at?: string;
  stats: ProfileStats;
  /** True when current viewer follows this user. */
  is_following?: boolean;
  /** True when this profile is the current viewer's own. */
  is_self?: boolean;
  /** Verified badge. */
  verified?: boolean;
  /** Host-extensible meta. */
  meta?: Record<string, ReactNode>;
}

export interface ProfileTab {
  key: string;
  label: ReactNode;
  /** Optional badge count. */
  count?: number;
  render: () => ReactNode;
}

// ---- Auth provider abstraction (do not modify) ----

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
  /** Backend base URL. Component appends `/v1`. */
  apiBaseUrl: string;
  auth?: Auth;
}

export interface UserProfileProps {
  /** Pre-fetched data. Wins over fetch when both supplied. */
  data?: UserProfileData;

  /** Live config; component fetches `GET /v1/users/:userId` when data absent. */
  config?: BlockConfig;
  userId?: string;

  // -------- Tabs --------

  /** Tabs rendered below the header (Posts / Likes / Replies etc). */
  tabs?: ProfileTab[];
  /** Controlled active tab. */
  activeTabKey?: string;
  onTabChange?: (key: string) => void;

  // -------- Actions --------

  /** Follow handler (shown when !is_self). */
  onFollow?: (userId: Ulid) => void | Promise<void>;
  /** Unfollow handler (shown when !is_self). */
  onUnfollow?: (userId: Ulid) => void | Promise<void>;
  /** Edit profile handler (shown when is_self). */
  onEdit?: () => void;

  // -------- Optional slots --------

  /** Extra actions next to follow/edit (Message / More 等). */
  headerExtra?: ReactNode;

  className?: string;
  height?: string | number;
}
