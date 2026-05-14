import type { ReactNode } from 'react';

export type Ulid = string;

export interface ProfileStats {
  posts?: number;
  followers?: number;
  following?: number;
  [key: string]: number | undefined;
}

export interface UserProfileData {
  id: Ulid;
  name: string;
  handle?: string;
  avatar?: string;
  cover?: string;
  bio?: ReactNode;
  location?: string;
  website?: string;
  joined_at?: string;
  stats: ProfileStats;
  is_following?: boolean;
  is_self?: boolean;
  verified?: boolean;
  meta?: Record<string, ReactNode>;
}

export interface ProfileTab {
  key: string;
  label: ReactNode;
  count?: number;
  render: () => ReactNode;
}

export interface UserProfileProps {
  data?: UserProfileData;
  apiBaseUrl?: string;
  userId?: string;
  tabs?: ProfileTab[];
  activeTabKey?: string;
  onTabChange?: (key: string) => void;
  onFollow?: (userId: Ulid) => void | Promise<void>;
  onUnfollow?: (userId: Ulid) => void | Promise<void>;
  onEdit?: () => void;
  headerExtra?: ReactNode;
  className?: string;
  height?: string | number;
}
