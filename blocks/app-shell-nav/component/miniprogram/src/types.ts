import type { ReactNode } from 'react';

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  route?: string;
  badge?: number | 'dot';
  children?: MenuItem[];
  disabled?: boolean;
}

export interface AppShellNavProps {
  items: MenuItem[];
  activeKey?: string;
  onSelect: (item: MenuItem) => void;
  brand?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  breakpoint?: number;
  defaultCollapsed?: boolean;
  persistKey?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  mobileDrawerOpen?: boolean;
  onMobileDrawerOpenChange?: (open: boolean) => void;
  width?: number;
  collapsedWidth?: number;
  ariaLabel?: string;
  className?: string;
}
