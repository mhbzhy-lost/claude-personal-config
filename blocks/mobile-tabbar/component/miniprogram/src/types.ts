import type { ReactNode } from 'react';

export interface TabbarTab {
  key: string;
  icon: ReactNode;
  activeIcon?: ReactNode;
  label: ReactNode;
  render: () => ReactNode;
  badge?: number | true;
}

export interface TabbarTheme {
  activeColor?: string;
  inactiveColor?: string;
  background?: string;
  borderColor?: string;
  badgeColor?: string;
}

export interface TabbarShellProps {
  tabs: TabbarTab[];
  activeKey?: string;
  defaultActiveKey?: string;
  onChange?: (key: string) => void;
  keepAlive?: boolean;
  theme?: TabbarTheme;
  safeAreaBottom?: boolean;
  className?: string;
}
